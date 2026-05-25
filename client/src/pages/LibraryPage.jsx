import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { FileText, Link2, Plus, Trash2 } from 'lucide-react';

export default function LibraryPage() {
  const [profile, setProfile] = useState(null);
  const [newSource, setNewSource] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/profile').then(setProfile).catch(() => {});
  }, []);

  const saveSources = async (sources) => {
    setSaving(true);
    try {
      const updated = await api.put('/profile', { ...profile, externalSources: sources });
      setProfile(updated);
    } finally {
      setSaving(false);
    }
  };

  const addSource = () => {
    const url = newSource.trim();
    if (!url) return;
    const sources = [...(profile.externalSources || []), { id: Date.now().toString(), url, addedAt: new Date().toISOString() }];
    saveSources(sources);
    setNewSource('');
  };

  const removeSource = (id) => {
    const sources = (profile.externalSources || []).filter(s => s.id !== id);
    saveSources(sources);
  };

  if (!profile) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading…</div>;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
          Library
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          These are the files and online sources the assistant will use when answering your questions.
        </p>
      </div>

      <div style={{ padding: 24, maxWidth: 920, margin: '0 auto' }}>
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={18} /> Uploaded Files
          </h2>
          {profile.files?.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              {profile.files.map(file => (
                <a
                  key={file.id}
                  href={file.path}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: 14,
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-surface)',
                    textDecoration: 'none',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{file.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {file.mimeType} • {Math.round(file.size / 1024)} KB
                  </span>
                </a>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              No files uploaded yet. Use the upload button in the chat to add files.
            </p>
          )}
        </section>

        <section>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link2 size={18} /> Online Sources
          </h2>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <input
              value={newSource}
              onChange={e => setNewSource(e.target.value)}
              placeholder="https://example.com/article"
              style={{ flex: 1, padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}
            />
            <button
              onClick={addSource}
              disabled={saving || !newSource.trim()}
              className="btn btn-primary btn-sm"
              style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)' }}
            >
              <Plus size={14} /> Add
            </button>
          </div>

          {profile.externalSources?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {profile.externalSources.map(source => (
                <div key={source.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                  <a href={source.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-primary)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 12 }}>
                    {source.url}
                  </a>
                  <button onClick={() => removeSource(source.id)} className="btn btn-ghost btn-sm" title="Remove source" style={{ padding: 6 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Add URLs here so the assistant can use them when answering your questions.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
