import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import TemplateEditor from '../components/settings/TemplateEditor';
import { Save, Key, User, Layers, Check, ShieldCheck } from 'lucide-react';

const TABS = [
  { id: 'profile', label: 'Profile', icon: <User size={15} /> },
  { id: 'templates', label: 'Prompt Templates', icon: <Layers size={15} /> },
  { id: 'api', label: 'API Keys', icon: <Key size={15} /> },
];

const PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI (GPT-4o)',
    keyLabel: 'OpenAI API Key',
    keyPlaceholder: 'sk-...',
    envVar: 'OPENAI_API_KEY',
  },
  {
    id: 'gemini',
    label: 'Google Gemini 3.0 Flash',
    keyLabel: 'Gemini API Key',
    keyPlaceholder: 'AIza...',
    envVar: 'GEMINI_API_KEY',
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude Opus 4',
    keyLabel: 'Anthropic API Key',
    keyPlaceholder: 'sk-ant-...',
    envVar: 'ANTHROPIC_API_KEY',
  },
];

export default function SettingsPage() {
  const [tab, setTab] = useState('profile');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>Settings</h1>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
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
      await api.put('/profile', {
        programmingLevel:  profile.programmingLevel,
        targetLanguage:    profile.targetLanguage,
        learningStyle:     profile.learningStyle,
        topics:            profile.topics,
        realLifeInterests: profile.realLifeInterests,
        strengths:         profile.strengths,
        weaknesses:        profile.weaknesses,
      });
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

        <Field label="Real-life interests" hint="Drawn on when giving coding examples">
          <input className="input-base" value={(profile.realLifeInterests || []).join(', ')} onChange={setArray('realLifeInterests')}
            placeholder="e.g. basketball, cooking, travel, photography" />
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
  const [preferredLLM, setPreferredLLM] = useState('openai');
  // keys holds the NEW values the user is typing — empty means "no change"
  const [keys, setKeys] = useState({ openai: '', gemini: '', anthropic: '' });
  // configuredKeys is the set of provider IDs that already have a stored key
  const [configuredKeys, setConfiguredKeys] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/profile').then(p => {
      setPreferredLLM(p.preferredLLM || 'openai');
      setConfiguredKeys(p.customApiKeysSet || []);
    }).catch(() => {});
  }, []);

  const setKey = (id) => (e) => setKeys(k => ({ ...k, [id]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      // Only send key fields that the user explicitly typed — empty string means
      // "keep whatever is stored" so we fall back to the existing value server-side
      await api.put('/profile', {
        preferredLLM,
        customApiKeys: keys,
      });
      // Update local state: mark provider as configured if a non-empty key was entered
      setConfiguredKeys(prev => {
        const next = new Set(prev);
        for (const [id, val] of Object.entries(keys)) {
          if (val) next.add(id);
        }
        return [...next];
      });
      setKeys({ openai: '', gemini: '', anthropic: '' });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>
      <h2 style={{ fontWeight: 600, marginBottom: 4, fontSize: 16 }}>AI Provider</h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24 }}>
        Choose which AI powers your tutoring sessions and optionally provide your own API keys.
        The server's built-in keys are used as fallbacks when no custom key is provided.
      </p>

      {/* Provider selector */}
      <div style={{ marginBottom: 28 }}>
        <label style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 500 }}>
          Preferred provider
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PROVIDERS.map(p => (
            <label key={p.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 'var(--radius-md)',
                border: `1px solid ${preferredLLM === p.id ? 'var(--accent)' : 'var(--border)'}`,
                background: preferredLLM === p.id ? 'var(--accent-muted)' : 'var(--bg-elevated)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <input
                type="radio"
                name="provider"
                value={p.id}
                checked={preferredLLM === p.id}
                onChange={() => setPreferredLLM(p.id)}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span style={{ fontSize: 13, fontWeight: preferredLLM === p.id ? 500 : 400 }}>
                {p.label}
              </span>
              {configuredKeys.includes(p.id) && (
                <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--green)' }}>
                  <ShieldCheck size={12} /> Custom key
                </span>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* Key inputs for every provider */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 500, margin: 0 }}>API Keys</p>
        {PROVIDERS.map(p => (
          <div key={p.id}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 13 }}>
              {p.keyLabel}
              {configuredKeys.includes(p.id) && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--green)', fontWeight: 400 }}>
                  <ShieldCheck size={11} /> Configured
                </span>
              )}
            </label>
            <input
              className="input-base"
              type="password"
              placeholder={configuredKeys.includes(p.id) ? 'Enter new key to replace stored one' : p.keyPlaceholder}
              value={keys[p.id]}
              onChange={setKey(p.id)}
            />
          </div>
        ))}
      </div>

      <div style={{ padding: 12, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--amber)', marginBottom: 16 }}>
        Keys are stored in your user profile on the server and are never returned to the browser.
        In production use a secrets manager. Leaving a key field empty keeps the existing stored key.
      </div>

      <button className="btn btn-primary" onClick={save} disabled={saving} style={{ alignSelf: 'flex-start' }}>
        {saving ? <span className="spinner" /> : saved ? <><Check size={14} /> Saved!</> : <><Save size={14} /> Save</>}
      </button>
    </div>
  );
}
