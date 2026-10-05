import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/axios';
import ScanProgress from './ScanProgress';
import { timeAgo } from '../utils/timeAgo';

interface Row { key: string; label: string; ai: string | null; shopper: string | null; missingForAi: boolean }
interface AiViewPage { url: string; label: string; rows: Row[]; aiPreview: string; error?: string }
export interface AiView { checkedAt: string; pages: AiViewPage[] }

const cell = (v: string | null, bad: boolean) =>
  v ? <span>✓ {v}</span> : <span style={{ color: bad ? 'var(--bad)' : 'var(--text-dim)' }}>✗ missing</span>;

export default function AiViewPanel({ brandId, initial }: { brandId?: string; initial?: AiView | null }) {
  const [view, setView] = useState<AiView | null>(initial ?? null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!brandId || running) return;
    setRunning(true);
    setError(null);
    try {
      const res = await api.post(`/brands/${brandId}/audit/ai-view`);
      setView(res.data?.data?.aiView ?? null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'The comparison failed. Please try again.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="panel">
      <h3>What AI crawlers see</h3>
      <p className="sub">ChatGPT's and Claude's crawlers read your page's raw HTML and don't run JavaScript. Anything that only appears after JavaScript is invisible to them.</p>
      {running && <ScanProgress title="Comparing AI and shopper views" hint="Opening your product page and homepage as GPTBot and as a shopper. This takes up to a minute." />}
      {error && <p style={{ color: 'var(--bad)', fontSize: '13px' }}>{error}</p>}
      {!running && view?.pages.map((p) => {
        const missing = p.rows.filter((r) => r.missingForAi).map((r) => r.label.toLowerCase());
        return (
          <div key={p.url} style={{ marginTop: '16px' }}>
            <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{p.label} <span className="mono" style={{ color: 'var(--text-dim)', fontWeight: 400 }}>{p.url}</span></div>
            {p.rows.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Fact</th><th>AI crawler</th><th>Shoppers</th></tr></thead>
                  <tbody>{p.rows.map((r) => (
                    <tr key={r.key}><td>{r.label}</td><td>{cell(r.ai, r.missingForAi)}</td><td>{p.error ? '—' : cell(r.shopper, false)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            {p.error && <p style={{ color: 'var(--text-dim)', fontSize: '13px' }}>{p.error}</p>}
            {!p.error && (missing.length
              ? <p style={{ color: 'var(--bad)', fontSize: '13.5px' }}>AI can't see the {missing.join(', ')} on this page: they load with JavaScript. <Link to="/recommendations">What to do →</Link></p>
              : <p style={{ color: 'var(--good)', fontSize: '13.5px' }}>AI crawlers see everything shoppers see on this page ✓</p>)}
            {p.aiPreview && <p className="mono" style={{ fontSize: '12px', color: 'var(--text-dim)' }}>What the AI reads first: “{p.aiPreview}…”</p>}
          </div>
        );
      })}
      <div style={{ marginTop: '14px', display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'flex-end' }}>
        {view && <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>Checked {timeAgo(view.checkedAt) ?? ''}</span>}
        <button type="button" className="btn" onClick={run} disabled={running || !brandId}>{view ? 'Compare again' : 'Compare'}</button>
      </div>
    </div>
  );
}
