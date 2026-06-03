import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { Code2, Send, CheckCircle2, MessageSquare, FlaskConical, Sparkles } from 'lucide-react';

const WELCOME_MSG = {
  id: 'welcome',
  role: 'assistant',
  content: "Hi!  I'm your CodeTutor onboarding assistant. I'll ask you a few questions to personalise your learning experience — it only takes a couple of minutes.\n\nLet's start: what programming language are you looking to learn or improve in, and what's drawing you to it?",
};

// Phase metadata shown in the header progress bar
const PHASES = [
  { id: 1, label: 'About you',   icon: <MessageSquare size={12} />,  description: 'Goals & preferences' },
  { id: 2, label: 'Quick check', icon: <FlaskConical size={12} />,   description: 'A couple of knowledge questions' },
  { id: 3, label: 'All set',     icon: <Sparkles size={12} />,       description: 'Building your profile' },
];

export default function OnboardingPage() {
  const [messages, setMessages] = useState([WELCOME_MSG]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [phase, setPhase] = useState(1);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const { completeOnboarding } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (!loading) inputRef.current?.focus();
  }, [loading]);

  // Auto-grow textarea
  const handleInputChange = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const send = async () => {
    if (!input.trim() || loading) return;

    const userMsg = { id: crypto.randomUUID(), role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setLoading(true);

    try {
      const data = await api.post('/profile/onboarding/chat', {
        messages: newMessages.map(m => ({ role: m.role, content: m.content })),
      });

      // Update phase indicator from server response
      if (data.phase) setPhase(data.phase);

      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: data.reply }]);

      if (data.onboardingComplete) {
        setPhase(3);
        setDone(true);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>

      {/* ── Header ── */}
      <div style={{
        padding: '14px 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)', flexShrink: 0,
      }}>
        <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, background: 'var(--accent)', borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Code2 size={15} color="#fff" />
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>CodeTutor AI</span>
          </div>

          {/* Phase stepper */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {PHASES.map((p, i) => {
              const isActive = phase === p.id;
              const isDone = phase > p.id || done;
              return (
                <React.Fragment key={p.id}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 0,
                    background: isDone ? 'var(--green-muted)' : isActive ? 'var(--accent-muted)' : 'transparent',
                    border: `1px solid ${isDone ? 'rgba(62,207,142,0.25)' : isActive ? 'rgba(79,142,247,0.3)' : 'var(--border)'}`,
                    transition: 'all 0.3s ease',
                  }}>
                    <span style={{ color: isDone ? 'var(--green)' : isActive ? 'var(--accent)' : 'var(--text-muted)' }}>
                      {isDone ? <CheckCircle2 size={12} /> : p.icon}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 500,
                      color: isDone ? 'var(--green)' : isActive ? 'var(--accent)' : 'var(--text-muted)',
                    }}>
                      {p.label}
                    </span>
                  </div>
                  {i < PHASES.length - 1 && (
                    <div style={{ width: 16, height: 1, background: phase > p.id ? 'var(--green)' : 'var(--border)', transition: 'background 0.3s' }} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Phase description sub-line */}
        <div style={{ maxWidth: 700, margin: '6px auto 0' }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
            {phase === 1 && 'Telling us about your goals and learning style'}
            {phase === 2 && 'A couple of quick questions so we can calibrate the right level for you'}
            {phase === 3 && 'Finalising your personalised profile…'}
          </p>
        </div>
      </div>

      {/* ── Messages ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 24px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>

          {/* Phase 2 transition notice — shown once the diagnostic phase begins */}
          {phase >= 2 && (
            <div className="fade-in" style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', marginBottom: 20,
              background: 'rgba(79,142,247,0.07)',
              border: '1px solid rgba(79,142,247,0.18)',
              borderRadius: 'var(--radius-md)',
              fontSize: 12, color: 'var(--text-secondary)',
            }}>
              <FlaskConical size={13} color="var(--accent)" style={{ flexShrink: 0 }} />
              To make sure your tutor pitches things at exactly the right level, I'll ask a couple of short knowledge questions. There are no wrong answers — this just helps me understand where you actually are.
            </div>
          )}

          {messages.map((msg) => (
            <MessageRow key={msg.id} msg={msg} />
          ))}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Avatar />
              <div style={{
                padding: '12px 16px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: '4px 14px 14px 14px',
              }}>
                <div className="typing-dots"><span /><span /><span /></div>
              </div>
            </div>
          )}

          {done && (
            <div className="fade-in" style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
              padding: '20px 18px', marginTop: 8,
              background: 'var(--green-muted)',
              borderRadius: 'var(--radius-md)', border: '1px solid rgba(62,207,142,0.2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green)', fontWeight: 500, fontSize: 13 }}>
                <CheckCircle2 size={16} />
                Your personalised profile is ready!
              </div>
              <button
                className="btn btn-primary"
                style={{ padding: '10px 28px', fontSize: 14, justifyContent: 'center' }}
                onClick={() => { completeOnboarding(); navigate('/'); }}
              >
                Start learning →
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Input ── */}
      {!done && (
        <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
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
                ref={inputRef}
                className="input-base"
                placeholder={phase === 2 ? 'Answer in your own words…' : 'Type your answer…'}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKey}
                rows={1}
                disabled={loading}
                style={{
                  flex: 1, background: 'transparent', border: 'none',
                  resize: 'none', lineHeight: 1.6, outline: 'none',
                  color: 'var(--text-primary)', fontFamily: 'var(--font-sans)',
                  fontSize: 14, paddingTop: 1,
                }}
              />
              <button
                className="btn btn-primary"
                onClick={send}
                disabled={loading || !input.trim()}
                style={{ padding: '7px 13px', borderRadius: 0, flexShrink: 0, alignSelf: 'flex-end' }}
              >
                {loading
                  ? <span className="spinner" style={{ width: 14, height: 14 }} />
                  : <Send size={14} />
                }
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>
              Shift+Enter for new line · Enter to send
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──

function Avatar() {
  return (
    <div style={{
      width: 32, height: 32, background: 'var(--accent)', borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, marginTop: 2,
    }}>
      <Code2 size={15} color="#fff" />
    </div>
  );
}

function MessageRow({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className="fade-in" style={{
      display: 'flex',
      flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 16,
    }}>
      {!isUser && <Avatar />}
      <div style={{
        maxWidth: '78%',
        padding: '11px 15px',
        borderRadius: 0,
        background: isUser ? 'var(--accent)' : (msg.error ? 'var(--red-muted)' : 'var(--bg-elevated)'),
        border: isUser ? 'none' : `1px solid ${msg.error ? 'rgba(248,113,113,0.2)' : 'var(--border)'}`,
        color: isUser ? '#fff' : (msg.error ? 'var(--red)' : 'var(--text-primary)'),
        fontSize: 14,
        lineHeight: 1.65,
        whiteSpace: 'pre-wrap',
      }}>
        {msg.content}
      </div>
    </div>
  );
}
