import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Code2, ArrowLeft, CheckCircle2 } from 'lucide-react';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate('/auth'), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
        <div style={{ textAlign: 'center', maxWidth: 360, padding: '0 24px' }}>
          <p style={{ color: 'var(--red)', marginBottom: 16 }}>Invalid reset link. Please request a new one.</p>
          <Link to="/forgot-password" className="btn btn-primary" style={{ justifyContent: 'center' }}>Request reset link</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
      <div style={{ width: '100%', maxWidth: 380, padding: '0 24px' }} className="fade-in">

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{ width: 32, height: 32, background: 'var(--accent)', borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Code2 size={17} color="#fff" />
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>CodeTutor AI</span>
        </div>

        {done ? (
          <div className="fade-in">
            <div style={{ width: 48, height: 48, background: 'var(--green-muted)', borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <CheckCircle2 size={22} color="var(--green)" />
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Password updated</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
              Your password has been changed. Redirecting you to sign in…
            </p>
          </div>
        ) : (
          <>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Set new password</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24 }}>
              Choose a strong password for your account.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>New password</label>
                <input
                  className="input-base"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Confirm password</label>
                <input
                  className="input-base"
                  type="password"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  minLength={8}
                />
              </div>

              {error && (
                <div style={{ padding: '10px 14px', background: 'var(--red-muted)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--red)', fontSize: 13 }}>
                  {error}
                </div>
              )}

              <button type="submit" className="btn btn-primary" disabled={loading}
                style={{ marginTop: 4, padding: '11px 16px', fontSize: 14, justifyContent: 'center' }}>
                {loading ? <span className="spinner" /> : 'Update password'}
              </button>
            </form>

            <Link to="/auth" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13, marginTop: 20, textDecoration: 'none' }}>
              <ArrowLeft size={13} /> Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
