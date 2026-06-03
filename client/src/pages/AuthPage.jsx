import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Code2, BookOpen, Zap, ArrowRight } from 'lucide-react';

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register, onboardingComplete } = useAuth();
  const navigate = useNavigate();

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const data = await login(form.email, form.password);
        navigate(data.onboardingComplete ? '/' : '/onboarding');
      } else {
        await register(form.name, form.email, form.password);
        navigate('/onboarding');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg-base)' }}>
      {/* Left panel */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '60px', background: 'linear-gradient(135deg, #0f1117 0%, #161b27 100%)',
        borderRight: '1px solid var(--border)', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.04, backgroundImage: 'radial-gradient(circle at 25% 25%, #4f8ef7 0%, transparent 50%), radial-gradient(circle at 75% 75%, #3ecf8e 0%, transparent 50%)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
            <div style={{ width: 36, height: 36, background: 'var(--accent)', borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Code2 size={20} color="#fff" />
            </div>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>CodeTutor AI</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700, lineHeight: 1.2, marginBottom: 16 }}>
            Your personal<br />
            <span style={{ color: 'var(--accent)' }}>programming mentor</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.7, marginBottom: 48, maxWidth: 380 }}>
            An AI tutor that adapts to your skill level, learning style, and goals, giving you personalized guidance every step of the way!
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[
              { icon: <BookOpen size={18} />, title: 'Adaptive learning', desc: 'Lessons that evolve with your progress' },
              { icon: <Zap size={18} />, title: 'Instant feedback', desc: 'Real-time code review and explanations' },
              { icon: <Code2 size={18} />, title: 'Any language', desc: 'Python, JavaScript, Java, and more' },
            ].map(f => (
              <div key={f.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 36, height: 36, background: 'var(--accent-muted)', borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                  {f.icon}
                </div>
                <div>
                  <div style={{ fontWeight: 500, marginBottom: 2 }}>{f.title}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div style={{ width: 480, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
        <div style={{ width: '100%', maxWidth: 380 }} className="fade-in">
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, marginBottom: 6 }}>
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 28, fontSize: 13 }}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'register' && (
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Full name</label>
                <input className="input-base" placeholder="Alex Johnson" value={form.name} onChange={set('name')} required />
              </div>
            )}
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Email</label>
              <input className="input-base" type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} required />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Password</label>
                {mode === 'login' && (
                  <Link to="/forgot-password" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>
                    Forgot password?
                  </Link>
                )}
              </div>
              <input className="input-base" type="password" placeholder="••••••••" value={form.password} onChange={set('password')} required minLength={8} />
            </div>

            {error && (
              <div style={{ padding: '10px 14px', background: 'var(--red-muted)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--red)', fontSize: 13 }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary" disabled={loading}
              style={{ marginTop: 6, padding: '11px 16px', fontSize: 14, justifyContent: 'center' }}>
              {loading ? <span className="spinner" /> : (
                <>{mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight size={16} /></>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
