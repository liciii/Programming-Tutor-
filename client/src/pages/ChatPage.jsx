import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { streamChat, api } from '../services/api';
import MessageBubble from '../components/chat/MessageBubble';
import TemplateSelector from '../components/chat/TemplateSelector';
import ProfileBadge from '../components/chat/ProfileBadge';
import { Send, RotateCcw, ChevronDown, Sparkles, UploadCloud, FileText } from 'lucide-react';

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
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const abortRef = useRef(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  useEffect(() => {
    if (location.state?.loadChat) {
      setMessages(location.state.loadChat);
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
    // Load uploaded file list for this user
    api.get('/profile').then(profile => {
      setUploadedFiles(profile.files || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!loading) scrollToBottom();
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  }, [input]);

  const sendMessage = useCallback(async (text) => {
    const content = (text || input).trim();
    if (!content || loading) return;

    const userMsg = { role: 'user', content, id: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    // Add placeholder assistant message
    const assistantId = Date.now() + 1;
    setMessages(prev => [...prev, { role: 'assistant', content: '', id: assistantId, streaming: true }]);

    try {
      const reader = await streamChat(
        newMessages.map(m => ({ role: m.role, content: m.content })),
        selectedTemplate
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
          } catch { }
        }
      }
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: `Sorry, something went wrong: ${err.message}`, streaming: false, error: true }
          : m
      ));
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [input, messages, loading, selectedTemplate]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const data = await api.uploadFile(file);
      setMessages(prev => [...prev, { role: 'assistant', content: `Uploaded file: ${data.file.name}` }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `File upload failed: ${err.message}` }]);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const clearChat = async () => {
    if (loading) return;
    if (messages.length > 0) {
      // Save this chat session before clearing
      await api.saveChatHistory(messages);
    }
    setMessages([]);
  };

  const isEmpty = messages.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)' }}>
      {/* Header */}
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

      {/* Messages */}
      <div ref={containerRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 20px', position: 'relative' }}>
        {isEmpty ? (
          <div className="fade-in" style={{ maxWidth: 580, margin: '40px auto 0', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, background: 'var(--accent-muted)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <Sparkles size={26} color="var(--accent)" />
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>What would you like to learn?</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 32 }}>
              Ask me to explain a concept, give you an exercise, review your code, or quiz you on any programming topic.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, textAlign: 'left' }}>
              {STARTER_PROMPTS.map(p => (
                <button key={p} onClick={() => sendMessage(p)}
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
                    <a
                      key={file.id}
                      href={file.path}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        textDecoration: 'none',
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-base)',
                        color: 'var(--text-primary)',
                        fontSize: 13,
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 420 }}>
                        {file.name}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {Math.round(file.size / 1024)} KB
                      </span>
                    </a>
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

      {/* Scroll to bottom button */}
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

      {/* Input area */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
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
              placeholder="Ask anything about programming…"
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
              style={{ flexShrink: 0, alignSelf: 'flex-end', padding: '6px 10px', borderRadius: 8 }}
              title="Upload a file"
            >
              {uploading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <UploadCloud size={14} />}
            </button>
            <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileChange} />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              className="btn btn-primary btn-sm"
              style={{ flexShrink: 0, alignSelf: 'flex-end', padding: '6px 12px', borderRadius: 8 }}
            >
              {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Send size={14} />}
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>
            Shift+Enter for new line · Enter to send
          </p>
        </div>
      </div>
    </div>
  );
}
