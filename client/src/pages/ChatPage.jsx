import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { streamChat, api } from '../services/api';
import MessageBubble from '../components/chat/MessageBubble';
import TemplateSelector from '../components/chat/TemplateSelector';
import ProfileBadge from '../components/chat/ProfileBadge';
import { Send, StopCircle, RotateCcw, ChevronDown, Sparkles, UploadCloud, FileText } from 'lucide-react';

const STARTER_PROMPTS = [
  "Explain what a recursive function is",
  "Give me a practice exercise on loops",
  "Review this code for me",
  "Quiz me on data structures",
  "Help me debug this error",
];

export default function ChatPage() {
  const location = useLocation();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [pendingFile, setPendingFile] = useState(null); // staged but not yet uploaded
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const abortRef = useRef(null);
  const messagesRef = useRef(messages);
  // when a chat is loaded from history, track how many messages ist not resaved
  const loadedLengthRef = useRef(0);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // autosave if user leaves without clickingn ew chat 
  useEffect(() => {
    return () => {
      const msgs = messagesRef.current;
      if (msgs.length > 0 && msgs.length > loadedLengthRef.current) {
        api.saveChatHistory(msgs.map(m => ({ role: m.role, content: m.content })));
      }
    };
  }, []);

  useEffect(() => {
    if (location.state?.loadChat) {
      setMessages(location.state.loadChat);
      loadedLengthRef.current = location.state.loadChat.length;
    }
  }, [location.state]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 100);
    };
    container.addEventListener('scroll', onScroll);
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    api.get('/profile').then(profile => {
      setUploadedFiles(profile.files || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!loading) scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  }, [input]);

  const stopGeneration = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const sendMessage = useCallback(async (text) => {
    const content = (text || input).trim();
    if (!content || loading) return;

    // uplad  staged file before sending 
    if (pendingFile) {
      setUploading(true);
      try {
        const data = await api.uploadFile(pendingFile);
        setUploadedFiles(prev => [...prev, data.file]);
      } catch (err) {
        setMessages(prev => [...prev, {
          role: 'assistant', content: `File upload failed: ${err.message}`,
          id: crypto.randomUUID(), error: true,
        }]);
        setUploading(false);
        return;
      } finally {
        setPendingFile(null);
        setUploading(false);
      }
    }

    const userMsg = { role: 'user', content, id: crypto.randomUUID() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    const assistantId = crypto.randomUUID();
    setMessages(prev => [...prev, { role: 'assistant', content: '', id: assistantId, streaming: true }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const reader = await streamChat(
        newMessages.map(m => ({ role: m.role, content: m.content })),
        selectedTemplate,
        controller.signal,
      );

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n').filter(l => l.startsWith('data: '));

        for (const line of lines) {
          try {
            const json = JSON.parse(line.slice(6));
            if (json.delta) {
              fullContent += json.delta;
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: fullContent } : m
              ));
            }
            if (json.done) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, streaming: false } : m
              ));
            }
          } catch { /* ignore malformed SSE line */ }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, streaming: false, stopped: true } : m
        ));
      } else {
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, content: `Sorry, something went wrong: ${err.message}`, streaming: false, error: true }
            : m
        ));
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [input, messages, loading, selectedTemplate, pendingFile]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    e.target.value = '';
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleDeleteFile = async (fileId) => {
    try {
      await api.deleteFile(fileId);
      setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
    } catch (err) {
      console.error('Delete file error:', err);
    }
  };

  const clearChat = async () => {
    if (loading) return;
    if (messages.length > 0) {
      await api.saveChatHistory(messages.map(m => ({ role: m.role, content: m.content })));
    }
    setMessages([]);
  };

  const isEmpty = messages.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-surface)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <TemplateSelector selected={selectedTemplate} onChange={setSelectedTemplate} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ProfileBadge />
          {messages.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={clearChat} title="Clear chat">
              <RotateCcw size={14} /> New chat
            </button>
          )}
        </div>
      </div>

      <div ref={containerRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', position: 'relative' }}>
        {isEmpty ? (
          <div className="fade-in" style={{ maxWidth: 580, margin: '40px auto 0', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, background: 'var(--accent-muted)', borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <Sparkles size={26} color="var(--accent)" />
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>What would you like to learn?</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 32 }}>
              Ask me to explain a concept, give you an exercise, review your code, or quiz you on any topic. Upload lecture notes or slides in the Library and I'll draw on them too.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, textAlign: 'left' }}>
              {STARTER_PROMPTS.map(p => (
                <button key={p} onClick={() => { setInput(p); setTimeout(() => textareaRef.current?.focus(), 0); }}
                  style={{
                    padding: '12px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: 13,
                    cursor: 'pointer', textAlign: 'left', lineHeight: 1.4, transition: 'all 0.15s',
                    gridColumn: p === STARTER_PROMPTS[4] ? 'span 2' : 'span 1',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {uploadedFiles.length > 0 && (
              <div style={{
                padding: '16px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <FileText size={16} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Uploaded files</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {uploadedFiles.map((file) => (
                    <div
                      key={file.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-base)',
                        fontSize: 13,
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380, color: 'var(--text-primary)' }}>
                        {file.name}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          {Math.round(file.size / 1024)} KB
                        </span>
                        <button
                          onClick={() => handleDeleteFile(file.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
                          title="Remove file"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {showScrollBtn && (
        <button onClick={scrollToBottom} style={{
          position: 'absolute', bottom: 90, right: 24,
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-secondary)', cursor: 'pointer', zIndex: 10,
          boxShadow: 'var(--shadow-md)',
        }}>
          <ChevronDown size={16} />
        </button>
      )}

      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>

          {pendingFile && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 12px', marginBottom: 6,
              background: 'var(--bg-elevated)', border: '1px solid var(--accent)',
            }}>
              <FileText size={13} color="var(--accent)" style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                {pendingFile.name}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                {Math.round(pendingFile.size / 1024)} KB
              </span>
              <button
                onClick={() => setPendingFile(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                title="Remove file"
              >
                ×
              </button>
            </div>
          )}

          <div style={{
            display: 'flex', gap: 10, alignItems: 'flex-end',
            background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: '10px 14px',
            transition: 'border-color 0.15s',
          }}
            onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={pendingFile ? `Ask a question about ${pendingFile.name}…` : 'Ask anything about programming…'}
              rows={1}
              disabled={loading}
              style={{
                flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)',
                fontSize: 14, lineHeight: 1.6, resize: 'none', outline: 'none',
                fontFamily: 'var(--font-sans)', paddingTop: 1,
              }}
            />
            <button
              onClick={handleUploadClick}
              disabled={uploading || loading}
              className="btn btn-ghost btn-sm"
              style={{ flexShrink: 0, alignSelf: 'flex-end', padding: '6px 10px', borderRadius: 0, color: pendingFile ? 'var(--accent)' : undefined }}
              title={pendingFile ? 'Replace file' : 'Attach a file'}
            >
              {uploading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <UploadCloud size={14} />}
            </button>
            <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileChange} />
            {loading ? (
              <button
                onClick={stopGeneration}
                className="btn btn-ghost btn-sm"
                style={{ flexShrink: 0, alignSelf: 'flex-end', padding: '6px 12px', borderRadius: 8, color: 'var(--text-secondary)' }}
                title="Stop generating"
              >
                <StopCircle size={14} />
              </button>
            ) : (
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() && !pendingFile}
                className="btn btn-primary btn-sm"
                style={{ flexShrink: 0, alignSelf: 'flex-end', padding: '6px 12px', borderRadius: 0 }}
              >
                <Send size={14} />
              </button>
            )}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>
            Shift+Enter for new line · Enter to send
          </p>
        </div>
      </div>
    </div>
  );
}
