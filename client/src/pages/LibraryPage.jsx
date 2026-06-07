import { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { FileText, Trash2, AlertCircle, Download, UploadCloud } from 'lucide-react';

export default function LibraryPage() {
  const [profile, setProfile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.get('/profile').then(setProfile).catch(() => {});
  }, []);

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

  if (!profile) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading…</div>;

  const files = profile.files || [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
          Library
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Upload files and the tutor will use them when answering your questions.
        </p>
      </div>

      <div style={{ padding: 24, maxWidth: 920, margin: '0 auto' }}>
        <section>
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
                  Upload lecture notes, slides, PDFs, code files, or any reference material
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
      </div>
    </div>
  );
}
