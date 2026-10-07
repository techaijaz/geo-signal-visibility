import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/axios';
import ScanProgress from './ScanProgress';
import { timeAgo } from '../utils/timeAgo';

interface Row { key: string; label: string; ai: string | null; shopper: string | null; missingForAi: boolean; tip?: string }
// score: facts the shopper sees (total, null if the shopper view failed) and how many the AI sees too; absent on old results
interface Score { seen: number; total: number | null; level: 'good' | 'warn' | 'bad' | null }
interface AiViewPage { url: string; label: string; rows: Row[]; aiPreview: string; score?: Score; error?: string }
export interface AiView { checkedAt: string; pages: AiViewPage[] }

// Red whenever the shopper sees something the AI doesn't, even if the AI has a weaker value (3 words vs 120)
const cell = (v: string | null, bad: boolean) =>
  bad ? <span style={{ color: 'var(--bad)' }}>✗ {v || 'missing'}</span>
    : v ? <span>✓ {v}</span>
    : <span style={{ color: 'var(--text-dim)' }}>✗ missing</span>;

const LEVEL_COLORS = {
  good: { background: 'rgba(74,222,128,0.13)', color: 'var(--good)' },
  warn: { background: 'var(--amber-soft)', color: 'var(--amber)' },
  bad: { background: 'rgba(248,113,113,0.13)', color: 'var(--bad)' },
};

// "AI sees 3 of 5 facts" in green (all), amber (some missing) or red (most missing)
const ScoreLine = ({ score }: { score: Score }) => {
  const fact = (n: number) => `${n} fact${n === 1 ? '' : 's'}`;
  if (score.total === null) {
    return <p style={{ fontSize: '15px', fontWeight: 600, margin: '8px 0' }}>AI sees {fact(score.seen)}; <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontSize: '13px' }}>the shopper view couldn't load</span></p>;
  }
  if (!score.total || !score.level) return null;
  return (
    <p style={{ margin: '8px 0' }}>
      <span style={{ ...LEVEL_COLORS[score.level], display: 'inline-block', padding: '6px 14px', borderRadius: '20px', fontSize: '16px', fontWeight: 700 }}>
        AI sees {score.seen} of {fact(score.total)}
      </span>
    </p>
  );
};

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
        const missingRows = p.rows.filter((r) => r.missingForAi);
        const missing = missingRows.map((r) => r.label.toLowerCase());
        const tips = missingRows.filter((r) => r.tip);
        return (
          <div key={p.url} style={{ marginTop: '16px' }}>
            <div style={{ fontWeight: 600, fontSize: '13.5px', overflowWrap: 'anywhere' }}>{p.label} <span className="mono" style={{ color: 'var(--text-dim)', fontWeight: 400 }}>{p.url}</span></div>
            {p.score && <ScoreLine score={p.score} />}
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
            {tips.length > 0 && (
              <ul style={{ margin: '10px 0 0', paddingLeft: '18px', fontSize: '13px', lineHeight: 1.5 }}>
                {tips.map((r) => <li key={r.key} style={{ marginBottom: '4px', overflowWrap: 'anywhere' }}><strong style={{ color: 'var(--bad)' }}>✗ {r.label}:</strong> {r.tip}</li>)}
              </ul>
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
