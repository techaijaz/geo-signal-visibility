import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/axios';
import ScanProgress from './ScanProgress';
import { timeAgo } from '../utils/timeAgo';

interface Row { key: string; label: string; ai: string | null; shopper: string | null; missingForAi: boolean }
interface AiViewPage { url: string; label: string; rows: Row[]; aiPreview: string; error?: string }
export interface AiView { checkedAt: string; pages: AiViewPage[] }

// Red whenever the shopper sees something the AI doesn't, even if the AI has a weaker value (3 words vs 120)
const cell = (v: string | null, bad: boolean) =>
  bad ? <span style={{ color: 'var(--bad)' }}>✗ {v || 'missing'}</span>
    : v ? <span>✓ {v}</span>
    : <span style={{ color: 'var(--text-dim)' }}>✗ missing</span>;

// productUrl: from the Products page ("Check this page"), checks that product page instead of the first one found
export default function AiViewPanel({ brandId, initial, productUrl }: { brandId?: string; initial?: AiView | null; productUrl?: string }) {
  const [view, setView] = useState<AiView | null>(initial ?? null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!brandId || running) return;
    setRunning(true);
    setError(null);
    try {
      const res = await api.post(`/brands/${brandId}/audit/ai-view`, productUrl ? { url: productUrl } : undefined);
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
      {productUrl && <p style={{ fontSize: '12.5px', margin: '0 0 8px', overflowWrap: 'anywhere' }}>Checking <span className="mono">{productUrl}</span></p>}
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
            {p.aiPreview && <p className="mono" style={{ fontSize: '12px', color: 'var(--text-dim)' }}>What the AI reads first: “{p.aiPreview}{p.aiPreview.length >= 300 ? '…' : ''}”</p>}
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
