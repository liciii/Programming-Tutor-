import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Plus, Pencil, Trash2, Lock, Save, X, Check, ChevronDown, ChevronUp } from 'lucide-react';

export default function TemplateEditor() {
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null); // { id, name, description, systemPrompt } or 'new'
  const [form, setForm] = useState({ name: '', description: '', systemPrompt: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.get('/templates').then(setTemplates).catch(() => {});
  useEffect(() => { load(); }, []);

  const startEdit = (t) => {
    setEditing(t.id);
    setForm({ name: t.name, description: t.description || '', systemPrompt: t.systemPrompt });
    setError('');
  };

  const startNew = () => {
    setEditing('new');
    setForm({ name: '', description: '', systemPrompt: '' });
    setError('');
  };

  const cancel = () => { setEditing(null); setError(''); };

  const save = async () => {
    if (!form.name.trim() || !form.systemPrompt.trim()) {
      setError('Name and system prompt are required.');
      return;
    }
    setSaving(true);
    try {
      if (editing === 'new') {
        await api.post('/templates', form);
      } else {
        await api.put(`/templates/${editing}`, form);
      }
      await load();
      setEditing(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this template?')) return;
    try {
      await api.delete(`/templates/${id}`);
      await load();
    } catch (e) {
      alert(e.message);
    }
  };

  const PLACEHOLDERS = ['{{programmingLevel}}', '{{targetLanguage}}', '{{learningStyle}}', '{{interests}}', '{{weaknesses}}', '{{strengths}}', '{{topics}}'];

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <h2 style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Prompt Templates</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Default templates are read-only. You can create custom templates or make edited copies.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={startNew} style={{ flexShrink: 0 }}>
          <Plus size={14} /> New template
        </button>
      </div>

      {/* Available placeholders */}
      <div style={{ padding: '10px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', marginBottom: 20, marginTop: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Available placeholders (auto-filled from learner profile):</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PLACEHOLDERS.map(p => (
            <code key={p} style={{ fontSize: 11, background: 'var(--accent-muted)', color: 'var(--accent)', padding: '2px 6px', borderRadius: 4 }}>{p}</code>
          ))}
        </div>
      </div>

      {/* New / edit form */}
      {editing && (
        <div className="card fade-in" style={{ marginBottom: 20, borderColor: 'var(--accent)' }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>
            {editing === 'new' ? 'New template' : 'Edit template'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>Template name *</label>
              <input className="input-base" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Explain with analogies" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>Description</label>
              <input className="input-base" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="When is this template used?" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>System prompt *</label>
              <textarea
                className="input-base"
                value={form.systemPrompt}
                onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
                rows={10}
                style={{ resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6 }}
                placeholder="You are a programming tutor. The student is a {{programmingLevel}} level..."
              />
            </div>
            {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
                {saving ? <span className="spinner" /> : <><Save size={13} /> Save</>}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={cancel}><X size={13} /> Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Template list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {templates.map(t => (
          <div key={t.id} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                {t.isDefault && <Lock size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />}
                <span style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                {t.isDefault && <span className="tag tag-blue" style={{ fontSize: 10, flexShrink: 0 }}>default</span>}
                {!t.isDefault && <span className="tag tag-green" style={{ fontSize: 10, flexShrink: 0 }}>custom</span>}
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                  style={{ padding: '3px 6px' }}
                >
                  {expanded === t.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                {!t.isDefault && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(t)} style={{ padding: '3px 6px' }}>
                      <Pencil size={13} />
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => remove(t.id)} style={{ padding: '3px 6px' }}>
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
            {t.description && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{t.description}</p>}
            {expanded === t.id && (
              <div className="fade-in" style={{ marginTop: 12, padding: 12, background: 'var(--bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.65, margin: 0 }}>
                  {t.systemPrompt}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
