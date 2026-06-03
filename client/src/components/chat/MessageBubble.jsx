import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Code2, User, Copy, Check, StopCircle } from 'lucide-react';

function CopyButton({ code }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} style={{
      position: 'absolute', top: 8, right: 8,
      background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 0, padding: '3px 8px', color: '#ccc', cursor: 'pointer',
      fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
    }}>
      {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
    </button>
  );
}

const markdownComponents = {
  code({ node, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    const code = String(children).replace(/\n$/, '');
    if (match) {
      return (
        <div style={{ position: 'relative', marginTop: 6, marginBottom: 6 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 14px', background: '#1a1f2e', borderRadius: 0,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <span style={{ fontSize: 11, color: '#888', fontFamily: 'var(--font-mono)' }}>{match[1]}</span>
          </div>
          <div style={{ position: 'relative' }}>
            <CopyButton code={code} />
            <SyntaxHighlighter
              style={vscDarkPlus}
              language={match[1]}
              PreTag="div"
              customStyle={{
                margin: 0, borderRadius: 0,
                fontSize: 13, lineHeight: 1.55,
                background: '#1a1f2e', padding: '14px',
              }}
              {...props}
            >
              {code}
            </SyntaxHighlighter>
          </div>
        </div>
      );
    }
    return (
      <code style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.88em',
        background: 'rgba(79,142,247,0.1)', color: 'var(--accent)',
        padding: '1px 5px', borderRadius: 0,
      }} {...props}>
        {children}
      </code>
    );
  },
  p: ({ children }) => <p style={{ margin: '0 0 10px', lineHeight: 1.7 }}>{children}</p>,
  ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: '0 0 10px' }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: '0 0 10px' }}>{children}</ol>,
  li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
  h1: ({ children }) => <h1 style={{ fontSize: 18, fontWeight: 600, margin: '14px 0 8px' }}>{children}</h1>,
  h2: ({ children }) => <h2 style={{ fontSize: 16, fontWeight: 600, margin: '12px 0 6px' }}>{children}</h2>,
  h3: ({ children }) => <h3 style={{ fontSize: 14, fontWeight: 600, margin: '10px 0 4px' }}>{children}</h3>,
  blockquote: ({ children }) => (
    <blockquote style={{
      borderLeft: '3px solid var(--accent)', paddingLeft: 14, margin: '10px 0',
      color: 'var(--text-secondary)', fontStyle: 'italic',
    }}>{children}</blockquote>
  ),
  strong: ({ children }) => <strong style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{children}</strong>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{children}</a>,
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '10px 0' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>{children}</table>
    </div>
  ),
  th: ({ children }) => <th style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 12 }}>{children}</th>,
  td: ({ children }) => <td style={{ padding: '6px 12px', borderBottom: '1px solid var(--border-light)' }}>{children}</td>,
};

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const isError = message.error;

  return (
    <div className={message.streaming ? '' : 'fade-in'} style={{
      display: 'flex',
      flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 16,
    }}>
      {/* Avatar */}
      <div style={{
        width: 30, height: 30, borderRadius: '50%', flexShrink: 0, marginTop: 2,
        background: isUser ? 'var(--bg-elevated)' : 'var(--accent)',
        border: isUser ? '1px solid var(--border)' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isUser
          ? <User size={14} color="var(--text-secondary)" />
          : <Code2 size={14} color="#fff" />
        }
      </div>

      {/* Bubble */}
      <div style={{
        maxWidth: '82%',
        padding: isUser ? '10px 14px' : '14px 18px',
        borderRadius: 0,
        background: isUser ? 'var(--accent)' : (isError ? 'var(--red-muted)' : 'var(--bg-surface)'),
        border: isUser ? 'none' : `1px solid ${isError ? 'rgba(248,113,113,0.2)' : 'var(--border)'}`,
        color: isUser ? '#fff' : (isError ? 'var(--red)' : 'var(--text-primary)'),
        fontSize: 14, lineHeight: 1.65,
      }}>
        {isUser ? (
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{message.content}</p>
        ) : (
          message.content === '' && message.streaming ? (
            <div className="typing-dots"><span /><span /><span /></div>
          ) : (
            <>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {message.content}
              </ReactMarkdown>
              {message.streaming && message.content && (
                <span style={{ display: 'inline-block', width: 2, height: 14, background: 'var(--accent)', marginLeft: 1, animation: 'pulse 0.8s ease-in-out infinite', verticalAlign: 'text-bottom' }} />
              )}
              {message.stopped && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
                  <StopCircle size={11} /> Generation stopped
                </div>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}
