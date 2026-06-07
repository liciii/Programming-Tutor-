import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { TrendingUp, BookOpen, Zap, Target, Calendar } from 'lucide-react';

export default function ProgressPage() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    api.get('/profile').then(setProfile).catch(() => {});
  }, []);

  if (!profile) {
    return <div style={{ padding: '24px', color: 'var(--text-muted)' }}>Loading…</div>;
  }

  const calculateStreak = () => {
    if (!profile.chatHistory?.length) return 0;
    const DAY_MS = 86_400_000;

    const sessionDays = new Set(
      profile.chatHistory.map(h => {
        const d = new Date(h.createdAt);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      })
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    let start = todayMs;
    if (!sessionDays.has(todayMs)) {
      start = todayMs - DAY_MS;
      if (!sessionDays.has(start)) return 0;
    }

    let streak = 0;
    for (let day = start; sessionDays.has(day); day -= DAY_MS) {
      streak++;
    }
    return streak;
  };

  const streak = calculateStreak();
  const totalSessions = profile.chatHistory?.length || 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
          Your Progress
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Track your learning journey and skill development
        </p>
      </div>

      <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
          <StatCard
            icon={<BookOpen size={20} />}
            title="Current Level"
            value={profile.programmingLevel?.charAt(0).toUpperCase() + profile.programmingLevel?.slice(1) || 'Not set'}
            subtitle={`in ${profile.targetLanguage || 'programming'}`}
          />
          <StatCard
            icon={<Target size={20} />}
            title="Topics Covered"
            value={profile.sessionTopics?.length || 0}
            subtitle="in tutoring sessions"
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', padding: '20px', border: '1px solid var(--border)' }}>
            <h3 style={{ fontWeight: 600, marginBottom: 16, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)' }}>
              <Zap size={16} /> Strengths
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {profile.strengths?.length > 0 ? (
                profile.strengths.map((skill) => (
                  <div key={skill} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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

          <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', padding: '20px', border: '1px solid var(--border)' }}>
            <h3 style={{ fontWeight: 600, marginBottom: 16, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, color: '#ff6b6b' }}>
              <Target size={16} /> Areas to Improve
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {profile.weaknesses?.length > 0 ? (
                profile.weaknesses.map((skill) => (
                  <div key={skill} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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

        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', padding: '20px', border: '1px solid var(--border)', marginBottom: 32 }}>
          <h3 style={{ fontWeight: 600, marginBottom: 16, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <BookOpen size={16} /> Topics Covered in Sessions
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {profile.sessionTopics?.length > 0 ? (
              profile.sessionTopics.map((topic) => (
                <div
                  key={topic}
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
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No topics covered yet. Start a tutoring session to track progress here</p>
            )}
          </div>
        </div>

        <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', padding: '20px', border: '1px solid var(--border)' }}>
          <h3 style={{ fontWeight: 600, marginBottom: 16, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={16} /> Recent Sessions
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {profile.sessionHistory?.length > 0 ? (
              profile.sessionHistory.slice(0, 10).map((session, i) => (
                <div
                  key={session.timestamp}
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
