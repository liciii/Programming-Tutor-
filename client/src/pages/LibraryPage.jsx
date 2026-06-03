import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { FileText, Link2, Plus, Trash2, AlertCircle, Download, UploadCloud } from 'lucide-react';

export default function LibraryPage() {
  const [profile, setProfile] = useState(null);
  const [newSource, setNewSource] = useState('');
  const [saving, setSaving] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.get('/profile').then(setProfile).catch(() => {});
  }, []);

  // ── File upload ────────────────────────────────────────────────────────────

  const uploadFile = async (file) => {
    setUploadError('');
    setUploading(true);
    try {
      const data = await api.uploadFile(file);
      setProfile(p => ({ ...p, files: [...(p.files || []), data.file] }));
    } catch (err) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleFileInput = (e) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);

  // ── File management ────────────────────────────────────────────────────────

  const handleDeleteFile = async (fileId) => {
    try {
      await api.deleteFile(fileId);
      setProfile(p => ({ ...p, files: (p.files || []).filter(f => f.id !== fileId) }));
    } catch (err) {
      console.error('Delete file error:', err);
    }
  };

  const handleDownloadFile = async (file) => {
    try {
      await api.downloadFile(file.id, file.name);
    } catch (err) {
      console.error('Download file error:', err);
    }
  };

  // ── Sources ────────────────────────────────────────────────────────────────

  const saveSources = async (sources) => {
    setSaving(true);
    try {
      await api.put('/profile', { externalSources: sources });
      setProfile(p => ({ ...p, externalSources: sources }));
    } finally {
      setSaving(false);
    }
  };

  const addSource = () => {
    const url = newSource.trim();
    if (!url) return;
    try {
      new URL(url);
    } catch {
      setUrlError('Enter a valid URL including https://');
      return;
    }
    setUrlError('');
    saveSources([
      ...(profile.externalSources || []),
      { id: crypto.randomUUID(), url, addedAt: new Date().toISOString() },
    ]);
    setNewSource('');
  };

  const removeSource = (id) => {
    saveSources((profile.externalSources || []).filter(s => s.id !== id));
  };

  const handleSourceKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addSource(); }
  };

  if (!profile) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading…</div>;

  const files = profile.files || [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
          Library
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Upload learning material and add online sources. The assistant draws on all of these when answering your questions.
        </p>
      </div>

      <div style={{ padding: 24, maxWidth: 920, margin: '0 auto' }}>

        {/* ── Uploaded Files ─────────────────────────────────────────────── */}
        <section style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={18} /> Uploaded Files
            </h2>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="btn btn-primary btn-sm"
              style={{ gap: 6 }}
            >
              {uploading
                ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Uploading…</>
                : <><UploadCloud size={14} /> Upload file</>
              }
            </button>
          </div>
          <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileInput} />

          {uploadError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>
              <AlertCircle size={12} /> {uploadError}
            </div>
          )}

          {/* Drop zone — always visible so drag-and-drop works */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => files.length === 0 && fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
              background: dragging ? 'var(--accent-muted)' : 'transparent',
              padding: files.length > 0 ? '12px' : '36px 24px',
              marginBottom: files.length > 0 ? 14 : 0,
              textAlign: 'center',
              transition: 'all 0.15s',
              cursor: files.length === 0 ? 'pointer' : 'default',
            }}
          >
            {files.length === 0 ? (
              <>
                <UploadCloud size={28} color="var(--text-muted)" style={{ marginBottom: 10 }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 4 }}>
                  Drag &amp; drop a file here, or click to browse
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  Upload lecture notes, slides, PDFs, or any reference material
                </p>
              </>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                Drop a file anywhere here to upload it
              </p>
            )}
          </div>

          {files.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {files.map(file => (
                <div
                  key={file.id}
                  style={{
                    padding: 14,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontWeight: 600, flex: 1, marginRight: 8, wordBreak: 'break-word', fontSize: 13 }}>
                      {file.name}
                    </span>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => handleDownloadFile(file)}
                        className="btn btn-ghost btn-sm"
                        title="Download"
                        style={{ padding: '4px 6px' }}
                      >
                        <Download size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteFile(file.id)}
                        className="btn btn-ghost btn-sm"
                        title="Delete"
                        style={{ padding: '4px 6px' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {file.mimeType} • {Math.round(file.size / 1024)} KB
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Online Sources ─────────────────────────────────────────────── */}
        <section>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link2 size={18} /> Online Sources
          </h2>
          <div style={{ display: 'flex', gap: 10, marginBottom: urlError ? 6 : 12 }}>
            <input
              value={newSource}
              onChange={e => { setNewSource(e.target.value); setUrlError(''); }}
              onKeyDown={handleSourceKeyDown}
              placeholder="https://example.com/article"
              style={{ flex: 1, padding: '10px 12px', border: `1px solid ${urlError ? 'var(--red)' : 'var(--border)'}`, background: 'var(--bg-elevated)' }}
            />
            <button
              onClick={addSource}
              disabled={saving || !newSource.trim()}
              className="btn btn-primary btn-sm"
              style={{ padding: '10px 14px' }}
            >
              <Plus size={14} /> Add
            </button>
          </div>
          {urlError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>
              <AlertCircle size={12} /> {urlError}
            </div>
          )}

          {profile.externalSources?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {profile.externalSources.map(source => (
                <div key={source.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                  <a href={source.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-primary)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 12 }}>
                    {source.url}
                  </a>
                  <button onClick={() => removeSource(source.id)} className="btn btn-ghost btn-sm" title="Remove" style={{ padding: 6 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Add URLs to documentation, articles, or course pages so the assistant can reference them.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
