import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Code2, MessageSquare, Settings, LogOut, ChevronRight, User, TrendingUp, BookOpen as LibraryIcon, Clock } from 'lucide-react';

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => { logout(); navigate('/auth'); };

  const navItems = [
    { to: '/', icon: <MessageSquare size={17} />, label: 'Chat' },
    { to: '/progress', icon: <TrendingUp size={17} />, label: 'Progress' },
    { to: '/history', icon: <Clock size={17} />, label: 'History' },
    { to: '/library', icon: <LibraryIcon size={17} />, label: 'Library' },
    { to: '/settings', icon: <Settings size={17} />, label: 'Settings' },
  ];

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <aside style={{
        width: collapsed ? 60 : 'var(--sidebar-w)',
        flexShrink: 0,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 57 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
            <div style={{ width: 28, height: 28, background: 'var(--accent)', borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Code2 size={15} color="#fff" />
            </div>
            {!collapsed && <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>CodeTutor AI</span>}
          </div>
          <button onClick={() => setCollapsed(c => !c)} className="btn btn-ghost btn-sm" style={{ padding: 4, flexShrink: 0 }}>
            <ChevronRight size={14} style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }} />
          </button>
        </div>

        <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map(item => {
            const active = location.pathname === item.to;
            return (
              <Link key={item.to} to={item.to} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 'var(--radius-md)',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                background: active ? 'var(--accent-muted)' : 'transparent',
                fontWeight: active ? 500 : 400,
                fontSize: 13, textDecoration: 'none',
                transition: 'all 0.15s', whiteSpace: 'nowrap', overflow: 'hidden',
              }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ flexShrink: 0 }}>{item.icon}</span>
                {!collapsed && item.label}
              </Link>
            );
          })}
        </nav>

        <div style={{ padding: '10px 8px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <div style={{ width: 28, height: 28, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <User size={14} color="var(--text-secondary)" />
            </div>
            {!collapsed && (
              <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
              </div>
            )}
            <button onClick={handleLogout} className="btn btn-ghost btn-sm" style={{ padding: 4, flexShrink: 0 }} title="Logout">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  );
}
