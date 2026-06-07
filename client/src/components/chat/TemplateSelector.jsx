import { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { ChevronDown, Sparkles, BookOpen, Code, Bug, HelpCircle, Star } from 'lucide-react';

const ICONS = {
  'default-explain': <BookOpen size={14} />,
  'default-exercise': <Star size={14} />,
  'default-feedback': <Code size={14} />,
  'default-debug': <Bug size={14} />,
  'default-quiz': <HelpCircle size={14} />,
};

export default function TemplateSelector({ selected, onChange }) {
  const [templates, setTemplates] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    api.get('/templates').then(setTemplates).catch(() => {});
  }, []);

  useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const current = templates.find(t => t.id === selected);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="btn btn-ghost btn-sm"
        style={{ gap: 6, color: selected ? 'var(--accent)' : 'var(--text-secondary)', background: selected ? 'var(--accent-muted)' : undefined }}
      >
        <Sparkles size={14} />
        <span style={{ fontSize: 12 }}>{current ? current.name : 'Auto-detect mode'}</span>
        <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div className="fade-in" style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 100,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 6, minWidth: 220,
          boxShadow: 'var(--shadow-lg)',
        }}>
          <button
            onClick={() => { onChange(null); setOpen(false); }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', borderRadius: 0, background: !selected ? 'var(--accent-muted)' : 'transparent',
              color: !selected ? 'var(--accent)' : 'var(--text-secondary)',
              border: 'none', cursor: 'pointer', fontSize: 13, textAlign: 'left',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (selected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { if (selected) e.currentTarget.style.background = 'transparent'; }}
          >
            <Sparkles size={14} />
            <div>
              <div style={{ fontWeight: 500 }}>Auto-detect</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>Choose template based on your message</div>
            </div>
          </button>

          {templates.length > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />}

          {templates.map(t => (
            <button
              key={t.id}
              onClick={() => { onChange(t.id); setOpen(false); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '8px 10px', borderRadius: 0,
                background: selected === t.id ? 'var(--accent-muted)' : 'transparent',
                color: selected === t.id ? 'var(--accent)' : 'var(--text-secondary)',
                border: 'none', cursor: 'pointer', fontSize: 13, textAlign: 'left',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (selected !== t.id) e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { if (selected !== t.id) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ marginTop: 1 }}>{ICONS[t.id] || <Sparkles size={14} />}</span>
              <div>
                <div style={{ fontWeight: 500 }}>{t.name}</div>
                {t.description && <div style={{ fontSize: 11, opacity: 0.7 }}>{t.description}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
