import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Search, Clock, ArrowRight } from 'lucide-react';

function detectIntent(message) {
  const msg = (message || '').toLowerCase();
  if (/explain|what is|how does|tell me about|describe|understand/.test(msg)) return 'Explain';
  if (/exercise|practice|challenge|task|problem|assignment/.test(msg)) return 'Exercise';
  if (/debug|error|bug|broken|not working|why does this|fix/.test(msg)) return 'Debug';
  if (/quiz|test me|question|check my knowledge/.test(msg)) return 'Quiz';
  if (/review|feedback|check my code|look at this/.test(msg)) return 'Feedback';
  return 'General';
}

export default function ChatHistoryPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    api.get('/profile').then(setProfile).catch(() => {});
  }, []);

  const chats = useMemo(() => {
    const all = profile?.chatHistory || [];
    if (!search.trim()) return all;

    const term = search.trim().toLowerCase();
    return all.filter(chat => {
      const combined = chat.messages.map(m => `${m.role}: ${m.content}`).join(' ');
      return combined.toLowerCase().includes(term);
    });
  }, [profile, search]);

  if (!profile) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading…</div>;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
          Chat History
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Browse and search your past conversations.
        </p>
      </div>

      <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18 }}>
          <Search size={16} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search your chat history..."
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              fontSize: 14,
            }}
          />
        </div>

        {chats.length === 0 ? (
          <div style={{ padding: 24, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              No past chats found. Start a conversation and then clear it to save it to history.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {chats.map(chat => {
              const isOpen = expandedId === chat.id;
              return (
                <div key={chat.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--bg-surface)' }}>
                  <button
                    onClick={() => setExpandedId(isOpen ? null : chat.id)}
                    style={{
                      width: '100%',
                      padding: '14px 16px',
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 600 }}>{chat.messages[0]?.content?.slice(0, 60) || 'Chat session'}</div>
                        <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                          {detectIntent(chat.messages[0]?.content)}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={12} />
                        {new Date(chat.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate('/', { state: { loadChat: chat.messages } });
                        }}
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '6px 10px' }}
                      >
                        <ArrowRight size={14} />
                      </button>
                      <span style={{ color: 'var(--text-muted)' }}>{isOpen ? '▴' : '▾'}</span>
                    </div>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
                      {chat.messages.map((m, idx) => (
                        <div key={idx} style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: m.role === 'assistant' ? 'var(--accent)' : 'var(--text-secondary)' }}>
                            {m.role.toUpperCase()}
                          </div>
                          <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, marginTop: 4 }}>{m.content}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
