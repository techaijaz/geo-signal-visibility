import { useState, useEffect } from 'react';
import api from '../../utils/axios';

interface CostLogRecord {
  _id: string;
  provider: string;
  queryText: string;
  tokensUsed: number;
  cost: number;
  latencyMs: number;
  createdAt: string;
}

interface ProviderStat {
  _id: string;
  totalTokens: number;
  totalCost: number;
  avgLatency: number;
  count: number;
}

export default function AdminCostLogs() {
  const [logs, setLogs] = useState<CostLogRecord[]>([]);
  const [providerStats, setProviderStats] = useState<ProviderStat[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCostLogs();
  }, []);

  const fetchCostLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/admin/cost-logs');
      setLogs(res.data.data.logs || []);
      setProviderStats(res.data.data.providerStats || []);
      setTotalLogs(res.data.data.totalLogs || 0);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load cost logs');
    } finally {
      setLoading(false);
    }
  };

  const grandTotalCost = providerStats.reduce((acc, p) => acc + (p.totalCost || 0), 0);
  const grandTotalTokens = providerStats.reduce((acc, p) => acc + (p.totalTokens || 0), 0);

  return (
    <div style={{ maxWidth: '1200px' }}>
      {/* Title */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '28px', margin: 0, fontWeight: 700 }}>API Token & Cost Logs</h1>
          <p style={{ color: 'var(--text-dim)', margin: '4px 0 0 0', fontSize: '14px' }}>
            Track LLM API token consumption, estimated costs, and latency across providers ({totalLogs} total API calls logged).
          </p>
        </div>
        <button onClick={fetchCostLogs} className="btn" style={{ fontSize: '13px' }}>
          🔄 Refresh Logs
        </button>
      </div>

      {error && (
        <div style={{ padding: '16px', background: 'rgba(248,113,113,0.1)', border: '1px solid #F87171', borderRadius: '8px', color: '#F87171', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '12px', textTransform: 'uppercase', marginBottom: '8px' }}>
            Total Est. Cost
          </div>
          <div className="mono" style={{ fontSize: '30px', fontWeight: 700, color: 'var(--amber)' }}>
            ${grandTotalCost.toFixed(4)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>Across all provider API calls</div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '12px', textTransform: 'uppercase', marginBottom: '8px' }}>
            Total Tokens Used
          </div>
          <div className="mono" style={{ fontSize: '30px', fontWeight: 700, color: 'var(--gemini)' }}>
            {grandTotalTokens.toLocaleString()}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>Prompt & completion tokens</div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '12px', textTransform: 'uppercase', marginBottom: '8px' }}>
            API Calls Logged
          </div>
          <div className="mono" style={{ fontSize: '30px', fontWeight: 700, color: 'var(--gpt)' }}>
            {totalLogs}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>In cost tracker database</div>
        </div>
      </div>

      {/* Provider Stats Breakdown */}
      {providerStats.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '20px', marginBottom: '28px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>Breakdown by Provider</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            {providerStats.map((p) => (
              <div key={p._id} style={{ background: 'var(--ink-2)', border: '1px solid var(--line-soft)', padding: '14px', borderRadius: '8px' }}>
                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text)', marginBottom: '8px' }}>{p._id}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>Calls: <span className="mono" style={{ color: 'var(--text)' }}>{p.count}</span></div>
                  <div>Tokens: <span className="mono" style={{ color: 'var(--text)' }}>{p.totalTokens.toLocaleString()}</span></div>
                  <div>Avg Latency: <span className="mono" style={{ color: 'var(--text)' }}>{Math.round(p.avgLatency || 0)}ms</span></div>
                  <div>Est Cost: <span className="mono" style={{ color: 'var(--amber)' }}>${(p.totalCost || 0).toFixed(4)}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Cost Logs Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', background: 'var(--ink-2)' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Recent Query API Logs</h3>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
            Loading API logs...
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--text-dim)' }}>
                <th style={{ padding: '12px 16px' }}>Timestamp</th>
                <th style={{ padding: '12px 16px' }}>Provider</th>
                <th style={{ padding: '12px 16px' }}>Query Text</th>
                <th style={{ padding: '12px 16px' }}>Tokens</th>
                <th style={{ padding: '12px 16px' }}>Latency</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Est Cost</th>
              </tr>
            </thead>
            <tbody>
              {logs.length > 0 ? (
                logs.map((log) => (
                  <tr key={log._id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: '12px 16px', color: 'var(--text-dim)', fontSize: '12px' }}>
                      {new Date(log.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{log.provider}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-dim)', maxWidth: '300px' }}>
                      {log.queryText || '—'}
                    </td>
                    <td className="mono" style={{ padding: '12px 16px', fontSize: '12px' }}>
                      {log.tokensUsed || 0}
                    </td>
                    <td className="mono" style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-dim)' }}>
                      {log.latencyMs || 0}ms
                    </td>
                    <td className="mono" style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--amber)' }}>
                      ${(log.cost || 0).toFixed(5)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-dim)' }}>
                    No API cost logs recorded yet. Logs are auto-created when AI scans are executed.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
