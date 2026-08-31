import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { path: '/admin', label: 'Overview & Stats', icon: '📊', end: true },
    { path: '/admin/users', label: 'Users & Subscriptions', icon: '👥' },
    { path: '/admin/billing', label: 'Billing & Invoices', icon: '💳' },
    { path: '/admin/ai-models', label: 'AI Models Manager', icon: '🤖' },
    { path: '/admin/api-keys', label: 'API Keys (Encrypted)', icon: '🔑' },
    { path: '/admin/categories', label: 'Categories', icon: '🏷️' },
    { path: '/admin/cost-logs', label: 'API Usage & Cost Logs', icon: '⚡' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--ink, #0A0E16)' }}>
      {/* Admin Sidebar */}
      <aside
        style={{
          width: '260px',
          background: 'var(--ink-2, #10141E)',
          borderRight: '1px solid var(--line, #232938)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '24px 16px',
          flexShrink: 0
        }}
      >
        <div>
          {/* Logo & Admin Badge */}
          <div 
            onClick={() => navigate('/')} 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px', 
              marginBottom: '28px',
              cursor: 'pointer',
              padding: '0 8px'
            }}
          >
            <div 
              style={{ 
                width: '10px', 
                height: '10px', 
                borderRadius: '50%', 
                background: 'var(--amber, #FFC857)',
                boxShadow: '0 0 10px var(--amber, #FFC857)' 
              }} 
            />
            <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '.02em', color: 'var(--text)' }}>
              Signal
            </span>
            <span 
              style={{ 
                fontSize: '10px', 
                fontWeight: 700, 
                background: 'rgba(230, 57, 70, 0.18)', 
                color: '#F87171', 
                border: '1px solid rgba(248, 113, 113, 0.3)',
                padding: '2px 8px', 
                borderRadius: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em'
              }}
            >
              ADMIN
            </span>
          </div>

          <div 
            style={{ 
              fontSize: '11px', 
              color: 'var(--text-faint, #565E70)', 
              textTransform: 'uppercase', 
              letterSpacing: '.08em', 
              marginBottom: '12px',
              padding: '0 8px' 
            }}
          >
            Administration
          </div>

          {/* Navigation Links */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  color: isActive ? 'var(--amber, #FFC857)' : 'var(--text-dim, #8890A3)',
                  background: isActive ? 'var(--amber-soft, rgba(255,200,87,0.12))' : 'transparent',
                  border: isActive ? '1px solid var(--amber-line, rgba(255,200,87,0.35))' : '1px solid transparent',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '13.5px',
                  transition: 'all 0.15s ease'
                })}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        {/* User Info & Exit Admin */}
        <div 
          style={{ 
            borderTop: '1px solid var(--line, #232938)', 
            paddingTop: '16px', 
            marginTop: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}
        >
          <div style={{ padding: '0 8px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
              {user?.name || 'Admin User'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              {user?.email}
            </div>
          </div>

          <button
            onClick={() => navigate('/')}
            className="btn"
            style={{ width: '100%', justifyContent: 'center', fontSize: '12.5px', padding: '8px 12px' }}
          >
            ◂ Exit Admin Panel
          </button>

          <button
            onClick={logout}
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'center', fontSize: '12.5px', color: '#F87171' }}
          >
            Log Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '32px 40px', overflowY: 'auto', maxHeight: '100vh' }}>
        <Outlet />
      </main>
    </div>
  );
}
