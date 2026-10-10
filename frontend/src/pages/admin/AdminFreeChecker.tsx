import { useEffect, useState } from 'react';
import api from '../../utils/axios';

interface Lead {
  email: string;
  domain: string;
  category: string;
  country: string;
  marketingConsent: boolean;
  signedUpAt: string | null;
  createdAt: string;
}

interface FreeCheckData {
  today: { used: number; limit: number };
  funnel: { checks: number; verified: number; signups: number };
  leads: Lead[];
}

// Free checker on the website: today's budget, the 7-day funnel and the leads it brought
export default function AdminFreeChecker() {
  const [data, setData] = useState<FreeCheckData | null>(null);
  const [limit, setLimit] = useState('');
  const [message, setMessage] = useState('');

  const load = () =>
    api.get('/admin/free-check').then((res) => {
      setData(res.data.data);
      setLimit(String(res.data.data.today.limit));
    });

  useEffect(() => {
    api
      .get('/admin/free-check')
      .then((res) => {
        setData(res.data.data);
        setLimit(String(res.data.data.today.limit));
      })
      .catch(() => setMessage('Could not load the free checker data.'));
  }, []);

  const save = async () => {
    try {
      await api.put('/admin/free-check', { limit: Number(limit) });
      setMessage('Saved');
      await load();
    } catch {
      setMessage('Limit must be a whole number from 0 to 5000');
    }
  };

  const downloadCsv = async () => {
    const res = await api.get('/admin/free-check/leads.csv', { responseType: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(res.data);
    link.download = 'free-check-leads.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  if (!data) return <div className="panel">{message || 'Loading…'}</div>;

  return (
    <div>
      <div className="panel">
        <h3>Free checker today</h3>
        <p className="sub">
          <span className="mono">{data.today.used}</span> of <span className="mono">{data.today.limit}</span> checks used (IST day)
        </p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label>
            Daily limit{' '}
            <input type="number" min={0} max={5000} value={limit} onChange={(e) => setLimit(e.target.value)} style={{ width: '110px' }} />
          </label>
          <button className="btn" onClick={save}>Save</button>
          {message && <span className="sub">{message}</span>}
        </div>
      </div>

      <div className="panel">
        <h3>Last 7 days</h3>
        <p>
          <span className="mono">{data.funnel.checks}</span> checks → <span className="mono">{data.funnel.verified}</span> emails verified →{' '}
          <span className="mono">{data.funnel.signups}</span> signups
        </p>
      </div>

      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Leads</h3>
          <button className="btn" onClick={downloadCsv} disabled={!data.leads.length}>Download CSV</button>
        </div>
        {data.leads.length === 0 ? (
          <p className="sub">No leads yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th align="left">Email</th>
                  <th align="left">Site</th>
                  <th align="left">Category</th>
                  <th align="left">Country</th>
                  <th align="left">Consent</th>
                  <th align="left">Signed up</th>
                  <th align="left">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.leads.map((l) => (
                  <tr key={l.email}>
                    <td>{l.email}</td>
                    <td>{l.domain}</td>
                    <td>{l.category}</td>
                    <td>{l.country || '—'}</td>
                    <td>{l.marketingConsent ? 'yes' : 'no'}</td>
                    <td>{l.signedUpAt ? new Date(l.signedUpAt).toLocaleDateString() : '—'}</td>
                    <td>{new Date(l.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
