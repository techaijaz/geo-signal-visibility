import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/axios';

interface SystemStats {
  totalUsers: number;
  totalOrgs: number;
  totalBrands: number;
  totalMentions: number;
  totalCategories: number;
  activeAiModels: number;
  planBreakdown: {
    free: number;
    starter: number;
    growth: number;
    agency: number;
  };
  recentUsers: Array<{
    _id: string;
    name: string;
    email: string;
    role: string;
    createdAt: string;
  }>;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/admin/stats');
      setStats(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load admin stats');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px 0', color: 'var(--text-dim)' }}>
        Loading platform overview & system statistics...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', background: 'rgba(248,113,113,0.1)', border: '1px solid #F87171', borderRadius: '8px', color: '#F87171' }}>
        Failed to load stats: {error}
        <button onClick={fetchStats} className="btn" style={{ marginTop: '12px', display: 'block' }}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px' }}>
      {/* Title */}
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '28px', margin: 0, fontWeight: 700 }}>Admin Platform Overview</h1>
          <p style={{ color: 'var(--text-dim)', margin: '4px 0 0 0', fontSize: '14px' }}>
            System-wide statistics, active AI model status, and user management controls.
          </p>
        </div>
        <button onClick={fetchStats} className="btn" style={{ fontSize: '13px' }}>
          🔄 Refresh Data
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', 
          gap: '16px',
          marginBottom: '32px' 
        }}
      >
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>
            Total Users
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--text)' }}>
            {stats?.totalUsers || 0}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--good)', marginTop: '4px' }}>
            Registered Accounts
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>
            Active AI Models
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--amber)' }}>
            {stats?.activeAiModels || 0}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>
            Online LLMs & Routers
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>
            Workspaces & Brands
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--gemini)' }}>
            {stats?.totalBrands || 0}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>
            Across {stats?.totalOrgs || 0} Organizations
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>
            Categories & Scans
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, color: 'var(--gpt)' }}>
            {stats?.totalMentions || 0}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>
            Mentions logged in {stats?.totalCategories || 0} Categories
          </div>
        </div>
      </div>

      {/* Plan Breakdown & Quick Links */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginBottom: '32px' }}>
        {/* Subscription Plan Distribution */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>
            Subscription Plan Breakdown
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            <div style={{ background: 'var(--ink-2)', border: '1px solid var(--line-soft)', padding: '14px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase' }}>Free</div>
              <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '4px', color: 'var(--text)' }}>
                {stats?.planBreakdown?.free || 0}
              </div>
            </div>
            <div style={{ background: 'var(--ink-2)', border: '1px solid var(--line-soft)', padding: '14px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase' }}>Starter</div>
              <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '4px', color: 'var(--amber)' }}>
                {stats?.planBreakdown?.starter || 0}
              </div>
            </div>
            <div style={{ background: 'var(--ink-2)', border: '1px solid var(--line-soft)', padding: '14px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase' }}>Growth</div>
              <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '4px', color: 'var(--gemini)' }}>
                {stats?.planBreakdown?.growth || 0}
              </div>
            </div>
            <div style={{ background: 'var(--ink-2)', border: '1px solid var(--line-soft)', padding: '14px', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-faint)', textTransform: 'uppercase' }}>Agency</div>
              <div style={{ fontSize: '22px', fontWeight: 700, marginTop: '4px', color: 'var(--gpt)' }}>
                {stats?.planBreakdown?.agency || 0}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Admin Actions */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Quick Actions</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button 
              onClick={() => navigate('/admin/users')}
              className="btn"
              style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', fontSize: '13px' }}
            >
              👥 Manage Users & Subscriptions
            </button>
            <button 
              onClick={() => navigate('/admin/billing')}
              className="btn"
              style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', fontSize: '13px' }}
            >
              💳 View Billing & Invoices
            </button>
            <button 
              onClick={() => navigate('/admin/ai-models')}
              className="btn"
              style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', fontSize: '13px' }}
            >
              🤖 Configure AI Models & Keys
            </button>
            <button 
              onClick={() => navigate('/admin/categories')}
              className="btn"
              style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', fontSize: '13px' }}
            >
              🏷️ Manage Product Categories
            </button>
            <button 
              onClick={() => navigate('/admin/cost-logs')}
              className="btn"
              style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', fontSize: '13px' }}
            >
              ⚡ View API Token & Cost Logs
            </button>
          </div>
        </div>
      </div>

      {/* Recent Users Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Recent Signups</h3>
          <button 
            onClick={() => navigate('/admin/users')}
            className="btn btn-ghost"
            style={{ fontSize: '12.5px', color: 'var(--amber)' }}
          >
            View All Users →
          </button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--text-dim)' }}>
              <th style={{ padding: '10px 12px' }}>Name</th>
              <th style={{ padding: '10px 12px' }}>Email</th>
              <th style={{ padding: '10px 12px' }}>Role</th>
              <th style={{ padding: '10px 12px' }}>Joined Date</th>
            </tr>
          </thead>
          <tbody>
            {stats?.recentUsers && stats.recentUsers.length > 0 ? (
              stats.recentUsers.map((u) => (
                <tr key={u._id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <td style={{ padding: '12px', fontWeight: 500 }}>{u.name}</td>
                  <td style={{ padding: '12px', color: 'var(--text-dim)' }}>{u.email}</td>
                  <td style={{ padding: '12px' }}>
                    <span 
                      style={{ 
                        padding: '2px 8px', 
                        borderRadius: '12px', 
                        fontSize: '11px', 
                        fontWeight: 600,
                        background: u.role === 'admin' ? 'rgba(255,200,87,0.15)' : 'rgba(255,255,255,0.06)',
                        color: u.role === 'admin' ? 'var(--amber)' : 'var(--text-dim)',
                        border: u.role === 'admin' ? '1px solid var(--amber-line)' : '1px solid var(--line)'
                      }}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td style={{ padding: '12px', color: 'var(--text-dim)' }}>
                    {new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)' }}>
                  No recent signups found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
