import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { User, X, TrendingUp, Target, Zap } from 'lucide-react';

export default function ProfileBadge() {
  const [profile, setProfile] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    api.get('/profile').then(setProfile).catch(() => {});
  }, [open]);

  useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const levelColors = { beginner: 'var(--green)', intermediate: 'var(--amber)', advanced: 'var(--accent)' };
  const levelColor = levelColors[profile?.programmingLevel] || 'var(--text-muted)';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
        <User size={14} />
        <span style={{ fontSize: 12 }}>
          {profile ? (
            <><span style={{ color: levelColor, fontWeight: 500 }}>{profile.programmingLevel}</span> · {profile.targetLanguage}</>
          ) : 'Profile'}
        </span>
      </button>

      {open && profile && (
        <div className="fade-in" style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100,
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 16, width: 280,
          boxShadow: 'var(--shadow-lg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Your profile</span>
            <button onClick={() => setOpen(false)} className="btn btn-ghost btn-sm" style={{ padding: 2 }}>
              <X size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <span className="tag tag-blue">{profile.targetLanguage}</span>
            <span className="tag" style={{ background: 'rgba(62,207,142,0.12)', color: 'var(--green)' }}>{profile.programmingLevel}</span>
            <span className="tag tag-amber">{profile.learningStyle}</span>
          </div>

          {profile.topics?.length > 0 && (
            <Section icon={<Target size={13} />} title="Topics">
              {profile.topics.slice(0, 4).map(t => (
                <span key={t} className="tag tag-blue" style={{ marginRight: 4, marginBottom: 4 }}>{t}</span>
              ))}
            </Section>
          )}

          {profile.strengths?.length > 0 && (
            <Section icon={<TrendingUp size={13} />} title="Strengths">
              {profile.strengths.slice(0, 3).map(s => (
                <div key={s} style={{ fontSize: 12, color: 'var(--green)', marginBottom: 2 }}>✓ {s}</div>
              ))}
            </Section>
          )}

          {profile.weaknesses?.length > 0 && (
            <Section icon={<Zap size={13} />} title="Working on">
              {profile.weaknesses.slice(0, 3).map(w => (
                <div key={w} style={{ fontSize: 12, color: 'var(--amber)', marginBottom: 2 }}>→ {w}</div>
              ))}
            </Section>
          )}

          {profile.sessionHistory?.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Recent sessions</div>
              {profile.sessionHistory.slice(-3).reverse().map((h, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {h.summary}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ icon, title, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, color: 'var(--text-muted)', fontSize: 11 }}>
        {icon} {title}
      </div>
      {children}
    </div>
  );
}
