import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { Code2, ArrowLeft, Mail } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
      <div style={{ width: '100%', maxWidth: 380, padding: '0 24px' }} className="fade-in">

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{ width: 32, height: 32, background: 'var(--accent)', borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Code2 size={17} color="#fff" />
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>CodeTutor AI</span>
        </div>

        {submitted ? (
          <div className="fade-in">
            <div style={{ width: 48, height: 48, background: 'var(--accent-muted)', borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <Mail size={22} color="var(--accent)" />
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Check your inbox</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              If an account exists for <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>, we've sent a reset link. It expires in 1 hour.
            </p>
            <Link to="/auth" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent)', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
              <ArrowLeft size={14} /> Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Forgot your password?</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
              Enter your account email and we'll send you a link to reset your password.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Email</label>
                <input
                  className="input-base"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div style={{ padding: '10px 14px', background: 'var(--red-muted)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--red)', fontSize: 13 }}>
                  {error}
                </div>
              )}

              <button type="submit" className="btn btn-primary" disabled={loading}
                style={{ marginTop: 4, padding: '11px 16px', fontSize: 14, justifyContent: 'center' }}>
                {loading ? <span className="spinner" /> : 'Send reset link'}
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
