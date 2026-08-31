import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/axios';

interface UserRecord {
  _id: string;
  name: string;
  email: string;
  role: string;
  plan: string;
  orgName: string;
  createdAt: string;
  lastLoginAt?: string;
  accountConfirmation?: {
    status: boolean;
  };
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Edit Plan modal state
  const [editingUserPlan, setEditingUserPlan] = useState<UserRecord | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string>('starter');

  useEffect(() => {
    fetchUsers();
  }, [page, roleFilter]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      queryParams.set('page', page.toString());
      queryParams.set('limit', '15');
      if (search.trim()) queryParams.set('q', search.trim());
      if (roleFilter) queryParams.set('role', roleFilter);

      const res = await api.get(`/admin/users?${queryParams.toString()}`);
      setUsers(res.data.data.users || []);
      setTotal(res.data.data.total || 0);
      setPages(res.data.data.pages || 1);
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.response?.data?.message || err.message || 'Error fetching users' });
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const handleToggleRole = async (targetUser: UserRecord) => {
    const newRole = targetUser.role === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`Are you sure you want to change ${targetUser.name}'s role to "${newRole}"?`)) return;

    try {
      await api.patch(`/admin/users/${targetUser._id}/role`, { role: newRole });
      setActionMessage({ type: 'success', text: `Updated ${targetUser.name}'s role to ${newRole}` });
      fetchUsers();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.response?.data?.message || err.message || 'Failed to update role' });
    }
  };

  const handleOpenPlanModal = (targetUser: UserRecord) => {
    setEditingUserPlan(targetUser);
    setSelectedPlan(targetUser.plan || 'starter');
  };

  const handleSavePlan = async () => {
    if (!editingUserPlan) return;
    try {
      await api.patch(`/admin/users/${editingUserPlan._id}/plan`, { plan: selectedPlan });
      setActionMessage({ type: 'success', text: `Updated ${editingUserPlan.name}'s plan to ${selectedPlan}` });
      setEditingUserPlan(null);
      fetchUsers();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.response?.data?.message || err.message || 'Failed to update plan' });
    }
  };

  const handleDeleteUser = async (targetUser: UserRecord) => {
    if (targetUser._id === currentUser?._id) {
      alert('You cannot delete your own admin account.');
      return;
    }
    if (!window.confirm(`WARNING: Are you sure you want to delete user "${targetUser.name}" (${targetUser.email})? This action cannot be undone.`)) return;

    try {
      await api.delete(`/admin/users/${targetUser._id}`);
      setActionMessage({ type: 'success', text: `User ${targetUser.name} deleted successfully` });
      fetchUsers();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.response?.data?.message || err.message || 'Failed to delete user' });
    }
  };

  return (
    <div style={{ maxWidth: '1200px' }}>
      {/* Title */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '28px', margin: 0, fontWeight: 700 }}>Users & Billing Management</h1>
          <p style={{ color: 'var(--text-dim)', margin: '4px 0 0 0', fontSize: '14px' }}>
            Manage user accounts, assign admin roles, and update subscription billing plans ({total} total users).
          </p>
        </div>
      </div>

      {actionMessage && (
        <div 
          style={{ 
            marginBottom: '20px', 
            padding: '12px 16px', 
            borderRadius: '8px', 
            background: actionMessage.type === 'success' ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
            border: `1px solid ${actionMessage.type === 'success' ? 'var(--good)' : 'var(--bad)'}`,
            color: actionMessage.type === 'success' ? 'var(--good)' : 'var(--bad)',
            fontSize: '13.5px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div 
        style={{ 
          background: 'var(--surface)', 
          border: '1px solid var(--line)', 
          borderRadius: '12px', 
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          gap: '16px',
          flexWrap: 'wrap',
          alignItems: 'center'
        }}
      >
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '260px' }}>
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--ink-2)',
              border: '1px solid var(--line)',
              color: 'var(--text)',
              padding: '9px 14px',
              borderRadius: '8px',
              fontSize: '13px'
            }}
          />
          <button type="submit" className="btn btn-primary" style={{ padding: '9px 16px', fontSize: '13px' }}>
            Search
          </button>
        </form>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Filter Role:</span>
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            style={{
              background: 'var(--ink-2)',
              border: '1px solid var(--line)',
              color: 'var(--text)',
              padding: '9px 12px',
              borderRadius: '8px',
              fontSize: '13px'
            }}
          >
            <option value="">All Roles</option>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
            Loading users list...
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--ink-2)', borderBottom: '1px solid var(--line)', color: 'var(--text-dim)' }}>
                <th style={{ padding: '12px 16px' }}>User / Email</th>
                <th style={{ padding: '12px 16px' }}>Role</th>
                <th style={{ padding: '12px 16px' }}>Workspace</th>
                <th style={{ padding: '12px 16px' }}>Subscription Plan</th>
                <th style={{ padding: '12px 16px' }}>Joined Date</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length > 0 ? (
                users.map((u) => (
                  <tr key={u._id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    {/* User info */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{u.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{u.email}</div>
                    </td>

                    {/* Role badge */}
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: u.role === 'admin' ? 'rgba(255,200,87,0.15)' : 'rgba(255,255,255,0.06)',
                          color: u.role === 'admin' ? 'var(--amber)' : 'var(--text-dim)',
                          border: u.role === 'admin' ? '1px solid var(--amber-line)' : '1px solid var(--line)'
                        }}
                      >
                        {u.role.toUpperCase()}
                      </span>
                    </td>

                    {/* Org Name */}
                    <td style={{ padding: '14px 16px', color: 'var(--text-dim)' }}>
                      {u.orgName}
                    </td>

                    {/* Plan Badge */}
                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          background:
                            u.plan === 'agency'
                              ? 'rgba(74,222,128,0.15)'
                              : u.plan === 'growth'
                              ? 'rgba(108,142,245,0.15)'
                              : u.plan === 'starter'
                              ? 'rgba(255,200,87,0.15)'
                              : 'rgba(255,255,255,0.06)',
                          color:
                            u.plan === 'agency'
                              ? 'var(--gpt)'
                              : u.plan === 'growth'
                              ? 'var(--gemini)'
                              : u.plan === 'starter'
                              ? 'var(--amber)'
                              : 'var(--text-dim)',
                          border: '1px solid var(--line)'
                        }}
                      >
                        {u.plan}
                      </span>
                    </td>

                    {/* Joined Date */}
                    <td style={{ padding: '14px 16px', color: 'var(--text-dim)', fontSize: '12px' }}>
                      {new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => handleToggleRole(u)}
                          className="btn"
                          title="Toggle Admin Role"
                          style={{ padding: '5px 10px', fontSize: '11px' }}
                        >
                          {u.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                        </button>
                        <button
                          onClick={() => handleOpenPlanModal(u)}
                          className="btn"
                          title="Change Plan"
                          style={{ padding: '5px 10px', fontSize: '11px', borderColor: 'var(--amber-line)' }}
                        >
                          💳 Edit Plan
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u)}
                          className="btn"
                          title="Delete User"
                          style={{ padding: '5px 10px', fontSize: '11px', color: '#F87171', borderColor: 'rgba(248,113,113,0.3)' }}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-dim)' }}>
                    No users found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* Pagination Footer */}
        {pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid var(--line)', background: 'var(--ink-2)' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
              Page {page} of {pages} ({total} users total)
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                className="btn"
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                Previous
              </button>
              <button
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(p + 1, pages))}
                className="btn"
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Plan Modal */}
      {editingUserPlan && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: '20px'
          }}
        >
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px', maxWidth: '440px', width: '100%' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>Update Subscription Plan</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '13px', margin: '0 0 20px 0' }}>
              Change subscription plan for user <strong style={{ color: 'var(--text)' }}>{editingUserPlan.name}</strong> ({editingUserPlan.email}).
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
              {['free', 'starter', 'growth', 'agency'].map((p) => (
                <label
                  key={p}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: selectedPlan === p ? '1px solid var(--amber)' : '1px solid var(--line)',
                    background: selectedPlan === p ? 'var(--amber-soft)' : 'var(--ink-2)',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="radio"
                      name="planSelect"
                      value={p}
                      checked={selectedPlan === p}
                      onChange={() => setSelectedPlan(p)}
                    />
                    <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{p} Plan</span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                    {p === 'free' ? '₹0/mo' : p === 'starter' ? '₹1,499/mo' : p === 'growth' ? '₹5,999/mo' : 'Custom'}
                  </span>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditingUserPlan(null)} className="btn btn-ghost">
                Cancel
              </button>
              <button onClick={handleSavePlan} className="btn btn-primary">
                Save Plan Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
