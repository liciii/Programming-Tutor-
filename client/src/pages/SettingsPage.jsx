import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import TemplateEditor from '../components/settings/TemplateEditor';
import { Save, Key, User, Layers, Check } from 'lucide-react';

const TABS = [
  { id: 'profile', label: 'Profile', icon: <User size={15} /> },
  { id: 'templates', label: 'Prompt Templates', icon: <Layers size={15} /> },
  { id: 'api', label: 'API Keys', icon: <Key size={15} /> },
];

export default function SettingsPage() {
  const [tab, setTab] = useState('profile');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>Settings</h1>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {/* Tab nav */}
        <div style={{ width: 200, borderRight: '1px solid var(--border)', padding: '16px 8px', flexShrink: 0, background: 'var(--bg-surface)' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 'var(--radius-md)', border: 'none',
                background: tab === t.id ? 'var(--accent-muted)' : 'transparent',
                color: tab === t.id ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: tab === t.id ? 500 : 400,
                fontSize: 13, cursor: 'pointer', marginBottom: 2,
                transition: 'all 0.15s', textAlign: 'left',
              }}
              onMouseEnter={e => { if (tab !== t.id) e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { if (tab !== t.id) e.currentTarget.style.background = 'transparent'; }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {tab === 'profile' && <ProfileTab />}
          {tab === 'templates' && <TemplateEditor />}
          {tab === 'api' && <ApiKeysTab />}
        </div>
      </div>
    </div>
  );
}

// ---- Profile Tab ----
function ProfileTab() {
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { api.get('/profile').then(setProfile).catch(() => {}); }, []);

  const set = (k) => (e) => setProfile(p => ({ ...p, [k]: e.target.value }));
  const setArray = (k) => (e) => setProfile(p => ({ ...p, [k]: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }));

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/profile', profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return <div style={{ color: 'var(--text-muted)' }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ fontWeight: 600, marginBottom: 4, fontSize: 16 }}>Learner Profile</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24 }}>
        This profile is used to personalize every tutoring interaction.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Field label="Programming level">
          <select className="input-base" value={profile.programmingLevel || ''} onChange={set('programmingLevel')}
            style={{ background: 'var(--bg-elevated)' }}>
            <option value="">Select level</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </Field>

        <Field label="Target language">
          <input className="input-base" value={profile.targetLanguage || ''} onChange={set('targetLanguage')}
            placeholder="e.g. Python, JavaScript, Java" />
        </Field>

        <Field label="Learning style">
          <select className="input-base" value={profile.learningStyle || ''} onChange={set('learningStyle')}
            style={{ background: 'var(--bg-elevated)' }}>
            <option value="">Select style</option>
            <option value="reading explanations">Reading explanations</option>
            <option value="hands-on practice">Hands-on practice</option>
            <option value="visual examples">Visual examples</option>
            <option value="mixed">Mixed approach</option>
          </select>
        </Field>

        <Field label="Topics of interest" hint="Comma-separated">
          <input className="input-base" value={(profile.topics || []).join(', ')} onChange={setArray('topics')}
            placeholder="e.g. loops, functions, data structures" />
        </Field>

        <Field label="Personal interests" hint="Used for real-world examples">
          <input className="input-base" value={(profile.interests || []).join(', ')} onChange={setArray('interests')}
            placeholder="e.g. gaming, music, football" />
        </Field>

        <Field label="Strengths (auto-detected)" hint="Comma-separated — edit if needed">
          <input className="input-base" value={(profile.strengths || []).join(', ')} onChange={setArray('strengths')}
            placeholder="e.g. variables, basic syntax" />
        </Field>

        <Field label="Weaknesses (auto-detected)" hint="Comma-separated — edit if needed">
          <input className="input-base" value={(profile.weaknesses || []).join(', ')} onChange={setArray('weaknesses')}
            placeholder="e.g. recursion, pointers" />
        </Field>

        <button className="btn btn-primary" onClick={save} disabled={saving} style={{ alignSelf: 'flex-start', gap: 6 }}>
          {saving ? <span className="spinner" /> : saved ? <><Check size={14} /> Saved!</> : <><Save size={14} /> Save changes</>}
        </button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6, fontSize: 13, fontWeight: 500 }}>
        {label}
        {hint && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}

// ---- API Keys Tab ----
function ApiKeysTab() {
  const [profile, setProfile] = useState(null);
  const [keys, setKeys] = useState({ openai: '', gemini: '', anthropic: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/profile').then(p => {
      setProfile(p);
      setKeys({ openai: p.customApiKeys?.openai || '', gemini: p.customApiKeys?.gemini || '', anthropic: p.customApiKeys?.anthropic || '' });
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const cleanKeys = Object.fromEntries(Object.entries(keys).filter(([, v]) => v));
      await api.put('/profile', { customApiKeys: cleanKeys });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ fontWeight: 600, marginBottom: 4, fontSize: 16 }}>API Keys</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24 }}>
        Optionally connect your own API keys. The system uses the server's OpenAI key by default. Custom keys are stored only in your profile file.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {[
          { id: 'openai', label: 'OpenAI API Key', placeholder: 'sk-...' },
          { id: 'gemini', label: 'Google Gemini API Key', placeholder: 'AIza...' },
          { id: 'anthropic', label: 'Anthropic (Claude) API Key', placeholder: 'sk-ant-...' },
        ].map(({ id, label, placeholder }) => (
          <div key={id}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500 }}>{label}</label>
            <input
              className="input-base"
              type="password"
              placeholder={placeholder}
              value={keys[id]}
              onChange={e => setKeys(k => ({ ...k, [id]: e.target.value }))}
            />
          </div>
        ))}

        <div style={{ padding: 12, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--amber)' }}>
          Keys are stored in your user profile JSON file on the server. In production, use a secrets manager.
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving} style={{ alignSelf: 'flex-start' }}>
          {saving ? <span className="spinner" /> : saved ? <><Check size={14} /> Saved!</> : <><Save size={14} /> Save keys</>}
        </button>
      </div>
    </div>
  );
}
