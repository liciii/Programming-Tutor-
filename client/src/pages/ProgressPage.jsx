import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { TrendingUp, BookOpen, Zap, Target, Calendar } from 'lucide-react';

export default function ProgressPage() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    // In dev mode, generate mock data
    if (true) { // DEV_MODE
      setProfile({
        name: 'Test User',
        programmingLevel: 'intermediate',
        targetLanguage: 'Python',
        topics: ['Functions', 'Classes', 'Decorators', 'Async/Await', 'Testing'],
        strengths: ['Problem solving', 'Debugging', 'Code organization'],
        weaknesses: ['Performance optimization', 'Design patterns'],
        sessionHistory: [
          { summary: 'Learned about decorators', timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() },
          { summary: 'Practiced class inheritance', timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
          { summary: 'Debugged async function', timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
          { summary: 'Explained list comprehensions', timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString() },
          { summary: 'Quiz on functions', timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
          { summary: 'Reviewed file I/O code', timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
        ],
      });
    } else {
      api.get('/profile').then(setProfile).catch(() => {});
    }
  }, []);

  if (!profile) {
    return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading…</div>;
  }

  const calculateStreak = () => {
    if (!profile.sessionHistory || profile.sessionHistory.length === 0) return 0;
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const hasSession = profile.sessionHistory.some(h => {
        const hDate = new Date(h.timestamp);
        hDate.setHours(0, 0, 0, 0);
        return hDate.getTime() === checkDate.getTime();
      });
      if (hasSession) streak++;
      else break;
    }
    return streak;
  };

  const streak = calculateStreak();
  const totalSessions = profile.sessionHistory?.length || 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Header */}
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
          Your Progress
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Track your learning journey and skill development
        </p>
      </div>

      <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Quick Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <StatCard
            icon={<BookOpen size={20} />}
            title="Current Level"
            value={profile.programmingLevel?.charAt(0).toUpperCase() + profile.programmingLevel?.slice(1) || 'Not set'}
            subtitle="in Python"
          />
          <StatCard
            icon={<Target size={20} />}
            title="Topics Learned"
            value={profile.topics?.length || 0}
            subtitle="areas of study"
          />
          <StatCard
            icon={<Zap size={20} />}
            title="Sessions"
            value={totalSessions}
            subtitle="learning sessions"
          />
          <StatCard
            icon={<TrendingUp size={20} />}
            title="Current Streak"
            value={streak}
            subtitle="days in a row"
          />
        </div>

        {/* Skills Section */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
          {/* Strengths */}
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', padding: '20px', border: '1px solid var(--border)' }}>
            <h3 style={{ fontWeight: 600, marginBottom: 16, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)' }}>
              <Zap size={16} /> Strengths
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {profile.strengths?.length > 0 ? (
                profile.strengths.map((skill, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: 'var(--accent)', flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 13 }}>{skill}</span>
                  </div>
                ))
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No strengths recorded yet</p>
              )}
            </div>
          </div>

          {/* Weaknesses */}
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', padding: '20px', border: '1px solid var(--border)' }}>
            <h3 style={{ fontWeight: 600, marginBottom: 16, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, color: '#ff6b6b' }}>
              <Target size={16} /> Areas to Improve
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {profile.weaknesses?.length > 0 ? (
                profile.weaknesses.map((skill, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#ff6b6b', flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 13 }}>{skill}</span>
                  </div>
                ))
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No weak areas identified yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Topics Progress */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', padding: '20px', border: '1px solid var(--border)', marginBottom: 32 }}>
          <h3 style={{ fontWeight: 600, marginBottom: 16, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={16} /> Topics Explored
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {profile.topics?.length > 0 ? (
              profile.topics.map((topic, i) => (
                <div
                  key={i}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--accent-muted)',
                    color: 'var(--accent)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  ✓ {topic}
                </div>
              ))
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No topics learned yet</p>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', padding: '20px', border: '1px solid var(--border)' }}>
          <h3 style={{ fontWeight: 600, marginBottom: 16, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={16} /> Recent Sessions
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {profile.sessionHistory?.length > 0 ? (
              profile.sessionHistory.slice(0, 10).map((session, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    paddingBottom: 12,
                    borderBottom: i < profile.sessionHistory.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <span style={{ fontSize: 13 }}>{session.summary}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {formatDate(session.timestamp)}
                  </span>
                </div>
              ))
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No sessions yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, title, value, subtitle }) {
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 8,
    }}>
      <div style={{ color: 'var(--accent)', marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</div>
    </div>
  );
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const diff = today.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return date.toLocaleDateString();
}
