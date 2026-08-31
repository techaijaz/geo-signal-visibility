import { useState, useEffect } from 'react';
import api from '../../utils/axios';

interface BillingStats {
  totalRevenue: number;
  mrr: number;
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  refundedInvoices: number;
  activeSubscriptions: number;
  planCounts: Record<string, number>;
}

interface InvoiceRecord {
  _id: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed' | 'refunded';
  plan: string;
  paymentMethod: string;
  paidAt: string;
  createdAt: string;
  userId?: {
    _id: string;
    name: string;
    email: string;
    role: string;
  };
  orgId?: {
    _id: string;
    name: string;
    plan: string;
  };
  items?: Array<{
    description: string;
    amount: number;
  }>;
}

interface UserOption {
  _id: string;
  name: string;
  email: string;
  plan?: string;
  orgName?: string;
}

export default function AdminBilling() {
  const [stats, setStats] = useState<BillingStats | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [totalInvoicesCount, setTotalInvoicesCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Manual Invoice Modal State
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [usersList, setUsersList] = useState<UserOption[]>([]);
  const [modalUserId, setModalUserId] = useState('');
  const [modalPlan, setModalPlan] = useState('starter');
  const [modalAmount, setModalAmount] = useState('1499');
  const [modalDesc, setModalDesc] = useState('');
  const [modalPaymentMethod, setModalPaymentMethod] = useState('Manual Admin / UPI');
  const [modalStatus, setModalStatus] = useState<'paid' | 'pending'>('paid');
  const [modalSubmitting, setModalSubmitting] = useState(false);

  useEffect(() => {
    fetchBillingStats();
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [page, statusFilter]);

  const fetchBillingStats = async () => {
    try {
      setStatsLoading(true);
      const res = await api.get('/admin/billing/stats');
      setStats(res.data.data);
    } catch (err: any) {
      console.error('Failed to fetch billing stats', err);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '15');
      if (search.trim()) params.set('q', search.trim());
      if (statusFilter) params.set('status', statusFilter);

      const res = await api.get(`/admin/billing/invoices?${params.toString()}`);
      setInvoices(res.data.data.invoices || []);
      setTotalInvoicesCount(res.data.data.total || 0);
      setPages(res.data.data.pages || 1);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to load invoices' });
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchInvoices();
  };

  const handleUpdateStatus = async (invoiceId: string, newStatus: string) => {
    try {
      await api.patch(`/admin/billing/invoices/${invoiceId}/status`, { status: newStatus });
      setMessage({ type: 'success', text: `Invoice status updated to ${newStatus.toUpperCase()}` });
      fetchInvoices();
      fetchBillingStats();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to update status' });
    }
  };

  const handleOpenCreateInvoiceModal = async () => {
    setShowInvoiceModal(true);
    if (usersList.length === 0) {
      try {
        const res = await api.get('/admin/users?limit=100');
        setUsersList(res.data.data.users || []);
        if (res.data.data.users?.length > 0) {
          setModalUserId(res.data.data.users[0]._id);
        }
      } catch (err) {
        console.error('Failed to fetch users list for modal', err);
      }
    }
  };

  const handleCreateInvoiceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalUserId) {
      alert('Please select a user');
      return;
    }

    try {
      setModalSubmitting(true);
      await api.post('/admin/billing/invoices/generate', {
        userId: modalUserId,
        plan: modalPlan,
        amount: Number(modalAmount) || 0,
        description: modalDesc || `GEO Platform - ${modalPlan.toUpperCase()} Subscription`,
        paymentMethod: modalPaymentMethod,
        status: modalStatus
      });

      setMessage({ type: 'success', text: 'New invoice generated successfully!' });
      setShowInvoiceModal(false);
      setModalDesc('');
      fetchInvoices();
      fetchBillingStats();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.response?.data?.message || 'Failed to create invoice' });
    } finally {
      setModalSubmitting(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div style={{ maxWidth: '1200px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', margin: 0, fontWeight: 700 }}>Billing & Subscriptions Manager</h1>
          <p style={{ color: 'var(--text-dim)', margin: '4px 0 0 0', fontSize: '14px' }}>
            System-wide revenue analytics, invoice management, plan subscriptions, and manual billing issuance.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => { fetchBillingStats(); fetchInvoices(); }} className="btn" style={{ fontSize: '13px' }}>
            🔄 Refresh
          </button>
          <button onClick={handleOpenCreateInvoiceModal} className="btn btn-primary" style={{ fontSize: '13px' }}>
            ➕ Create Custom Invoice
          </button>
        </div>
      </div>

      {message && (
        <div
          style={{
            marginBottom: '24px',
            padding: '12px 16px',
            borderRadius: '8px',
            background: message.type === 'success' ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
            border: `1px solid ${message.type === 'success' ? 'var(--good)' : 'var(--bad)'}`,
            color: message.type === 'success' ? 'var(--good)' : 'var(--bad)',
            fontSize: '13.5px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Financial Overview KPI Cards */}
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
            Total Paid Revenue
          </div>
          <div style={{ fontSize: '30px', fontWeight: 700, color: 'var(--good)' }}>
            {statsLoading ? '...' : formatCurrency(stats?.totalRevenue || 0)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>
            {stats?.paidInvoices || 0} Paid Invoices
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>
            Monthly Recurring Revenue (MRR)
          </div>
          <div style={{ fontSize: '30px', fontWeight: 700, color: 'var(--amber)' }}>
            {statsLoading ? '...' : formatCurrency(stats?.mrr || 0)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>
            Estimated monthly subscriber value
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>
            Active Paid Subscriptions
          </div>
          <div style={{ fontSize: '30px', fontWeight: 700, color: 'var(--gemini)' }}>
            {statsLoading ? '...' : stats?.activeSubscriptions || 0}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>
            Paid Starter, Growth & Agency Workspaces
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>
            Total Invoices Issued
          </div>
          <div style={{ fontSize: '30px', fontWeight: 700, color: 'var(--gpt)' }}>
            {statsLoading ? '...' : stats?.totalInvoices || 0}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>
            {stats?.pendingInvoices || 0} Pending • {stats?.refundedInvoices || 0} Refunded
          </div>
        </div>
      </div>

      {/* Plan Distribution & Subscription Tiers */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '24px', marginBottom: '32px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Active Tier Subscriptions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {[
            { id: 'free', name: 'Free', price: '₹0', color: 'var(--text-dim)', bg: 'rgba(255,255,255,0.05)' },
            { id: 'starter', name: 'Starter', price: '₹1,499/mo', color: 'var(--amber)', bg: 'rgba(255,200,87,0.12)' },
            { id: 'growth', name: 'Growth', price: '₹5,999/mo', color: 'var(--gemini)', bg: 'rgba(108,142,245,0.12)' },
            { id: 'agency', name: 'Agency', price: 'Custom (₹19,999/mo)', color: 'var(--gpt)', bg: 'rgba(74,222,128,0.12)' }
          ].map((plan) => (
            <div key={plan.id} style={{ background: 'var(--ink-2)', border: '1px solid var(--line-soft)', padding: '16px', borderRadius: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: 700, fontSize: '14px', color: plan.color }}>{plan.name}</span>
                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: plan.bg, color: plan.color, fontWeight: 600 }}>
                  {stats?.planCounts?.[plan.id] || 0} orgs
                </span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>{plan.price}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Invoices Search & Filter Bar */}
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
            placeholder="Search by invoice number or payment method..."
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
          <span style={{ fontSize: '12px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Status Filter:</span>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            style={{
              background: 'var(--ink-2)',
              border: '1px solid var(--line)',
              color: 'var(--text)',
              padding: '9px 12px',
              borderRadius: '8px',
              fontSize: '13px'
            }}
          >
            <option value="">All Statuses</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>
      </div>

      {/* Invoices Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
            Loading invoices list...
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--ink-2)', borderBottom: '1px solid var(--line)', color: 'var(--text-dim)' }}>
                <th style={{ padding: '12px 16px' }}>Invoice #</th>
                <th style={{ padding: '12px 16px' }}>Customer / Email</th>
                <th style={{ padding: '12px 16px' }}>Plan</th>
                <th style={{ padding: '12px 16px' }}>Amount</th>
                <th style={{ padding: '12px 16px' }}>Payment Method</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Date</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length > 0 ? (
                invoices.map((inv) => (
                  <tr key={inv._id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--amber)' }}>
                      {inv.invoiceNumber}
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{inv.userId?.name || 'Customer'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{inv.userId?.email || 'N/A'}</div>
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ textTransform: 'capitalize', fontWeight: 600, color: 'var(--text)' }}>
                        {inv.plan}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--good)' }}>
                      {formatCurrency(inv.amount)}
                    </td>

                    <td style={{ padding: '14px 16px', color: 'var(--text-dim)', fontSize: '12px' }}>
                      {inv.paymentMethod || 'Razorpay / Card'}
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          background:
                            inv.status === 'paid'
                              ? 'rgba(74,222,128,0.15)'
                              : inv.status === 'pending'
                              ? 'rgba(255,200,87,0.15)'
                              : inv.status === 'refunded'
                              ? 'rgba(108,142,245,0.15)'
                              : 'rgba(248,113,113,0.15)',
                          color:
                            inv.status === 'paid'
                              ? 'var(--good)'
                              : inv.status === 'pending'
                              ? 'var(--amber)'
                              : inv.status === 'refunded'
                              ? 'var(--gemini)'
                              : 'var(--bad)',
                          border: '1px solid var(--line)'
                        }}
                      >
                        {inv.status}
                      </span>
                    </td>

                    <td style={{ padding: '14px 16px', color: 'var(--text-dim)', fontSize: '12px' }}>
                      {new Date(inv.paidAt || inv.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>

                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <select
                        value={inv.status}
                        onChange={(e) => handleUpdateStatus(inv._id, e.target.value)}
                        style={{
                          background: 'var(--ink-2)',
                          border: '1px solid var(--line)',
                          color: 'var(--text)',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '11.5px',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="paid">Set Paid</option>
                        <option value="pending">Set Pending</option>
                        <option value="refunded">Set Refunded</option>
                        <option value="failed">Set Failed</option>
                      </select>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-dim)' }}>
                    No invoices found.
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
              Page {page} of {pages} ({totalInvoicesCount} total invoices)
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

      {/* Create Custom Invoice Modal */}
      {showInvoiceModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
            padding: '20px'
          }}
        >
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '28px', maxWidth: '500px', width: '100%' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px' }}>Generate Custom Invoice</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '13px', margin: '0 0 20px 0' }}>
              Issue a manual invoice or billing record for a specific user workspace.
            </p>

            <form onSubmit={handleCreateInvoiceSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>Select Customer / User:</label>
                <select
                  value={modalUserId}
                  onChange={(e) => setModalUserId(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    background: 'var(--ink-2)',
                    border: '1px solid var(--line)',
                    color: 'var(--text)',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    fontSize: '13px'
                  }}
                >
                  {usersList.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name} ({u.email}) - {u.orgName || 'Workspace'}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>Plan:</label>
                  <select
                    value={modalPlan}
                    onChange={(e) => {
                      const p = e.target.value;
                      setModalPlan(p);
                      if (p === 'starter') setModalAmount('1499');
                      else if (p === 'growth') setModalAmount('5999');
                      else if (p === 'agency') setModalAmount('19999');
                      else setModalAmount('0');
                    }}
                    style={{
                      width: '100%',
                      background: 'var(--ink-2)',
                      border: '1px solid var(--line)',
                      color: 'var(--text)',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      fontSize: '13px'
                    }}
                  >
                    <option value="starter">Starter Plan (₹1,499)</option>
                    <option value="growth">Growth Plan (₹5,999)</option>
                    <option value="agency">Agency Plan (₹19,999)</option>
                    <option value="free">Free Plan (₹0)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>Amount (INR ₹):</label>
                  <input
                    type="number"
                    value={modalAmount}
                    onChange={(e) => setModalAmount(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      background: 'var(--ink-2)',
                      border: '1px solid var(--line)',
                      color: 'var(--text)',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      fontSize: '13px'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>Payment Method:</label>
                <input
                  type="text"
                  placeholder="e.g. Razorpay / Direct Bank Transfer / UPI"
                  value={modalPaymentMethod}
                  onChange={(e) => setModalPaymentMethod(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--ink-2)',
                    border: '1px solid var(--line)',
                    color: 'var(--text)',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>Description / Line Item:</label>
                <input
                  type="text"
                  placeholder="GEO Platform Subscription Fee"
                  value={modalDesc}
                  onChange={(e) => setModalDesc(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--ink-2)',
                    border: '1px solid var(--line)',
                    color: 'var(--text)',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    fontSize: '13px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>Initial Status:</label>
                <select
                  value={modalStatus}
                  onChange={(e) => setModalStatus(e.target.value as 'paid' | 'pending')}
                  style={{
                    width: '100%',
                    background: 'var(--ink-2)',
                    border: '1px solid var(--line)',
                    color: 'var(--text)',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    fontSize: '13px'
                  }}
                >
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button type="button" onClick={() => setShowInvoiceModal(false)} className="btn btn-ghost">
                  Cancel
                </button>
                <button type="submit" disabled={modalSubmitting} className="btn btn-primary">
                  {modalSubmitting ? 'Creating...' : 'Issue Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
