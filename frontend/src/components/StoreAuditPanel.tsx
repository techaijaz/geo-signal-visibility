import { Fragment, useEffect, useRef, useState } from 'react';
import api from '../utils/axios';
import ScanProgress from './ScanProgress';
import { timeAgo } from '../utils/timeAgo';

type Level = 'good' | 'warn' | 'bad';
interface StoreCheck { key: string; label: string; pass: boolean; points: number; max: number; detail: string; tip?: string }
interface StorePage { url: string; name: string; kind: 'product' | 'collection'; score: number | null; level: Level | null; checks: StoreCheck[]; error?: string }
export interface StoreAudit { checkedAt: string; source: 'products' | 'sitemap' | 'homepage'; score: number | null; pages: StorePage[] }

const LEVEL_COLORS: Record<Level, React.CSSProperties> = {
  good: { background: 'rgba(74,222,128,0.13)', color: 'var(--good)' },
  warn: { background: 'var(--amber-soft)', color: 'var(--amber)' },
  bad: { background: 'rgba(248,113,113,0.13)', color: 'var(--bad)' },
};
const levelOf = (score: number): Level => (score >= 80 ? 'good' : score >= 50 ? 'warn' : 'bad');
const SOURCE: Record<StoreAudit['source'], string> = {
  products: 'your saved products',
  sitemap: "your store's sitemap",
  homepage: 'links on your homepage',
};
const PRODUCT_COLS = ['schema', 'price', 'reviews', 'description', 'faq', 'alt', 'meta'];
const COL_LABELS: Record<string, string> = { schema: 'Schema', price: 'Price', reviews: 'Reviews', description: 'Description', faq: 'FAQ', alt: 'Alt text', meta: 'Title & meta' };
const small: React.CSSProperties = { fontSize: '12px', color: 'var(--text-faint)' };

const Mark = ({ c }: { c?: StoreCheck }) =>
  c ? <span style={{ color: c.pass ? 'var(--good)' : 'var(--bad)', fontWeight: 700 }} title={c.detail}>{c.pass ? '✓' : '✗'}</span> : <span style={small}>—</span>;

const Pill = ({ score, big }: { score: number; big?: boolean }) => (
  <span style={{ ...LEVEL_COLORS[levelOf(score)], display: 'inline-block', padding: big ? '6px 14px' : '2px 9px', borderRadius: '20px', fontSize: big ? '16px' : '12.5px', fontWeight: 700 }}>
    {big ? `Store AI-readiness ${score}/100` : score}
  </span>
);

// What each check found, and the fix for every one that failed
function Details({ page }: { page: StorePage }) {
  if (page.error) return <p style={{ color: 'var(--bad)', fontSize: '13px', margin: '4px 0' }}>{page.error}</p>;
  return (
    <div style={{ fontSize: '12.5px' }}>
      <a href={page.url} target="_blank" rel="noreferrer" style={{ overflowWrap: 'anywhere' }}>{page.url}</a>
      {page.checks.map((c) => (
        <div key={c.key} style={{ margin: '6px 0' }}>
          <Mark c={c} /> <strong>{c.label}</strong> <span style={small}>· {c.detail}</span>
          {c.tip && <div style={{ ...small, marginLeft: '16px' }}>{c.tip}</div>}
        </div>
      ))}
    </div>
  );
}

export default function StoreAuditPanel({ brandId, initial }: { brandId?: string; initial?: StoreAudit | null }) {
  const [view, setView] = useState<StoreAudit | null>(initial ?? null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // Opened details stay as wide as the visible part of the table, so nothing is cut off on phones
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState<number | null>(null);
  useEffect(() => {
    const measure = () => setBoxWidth(boxRef.current?.clientWidth ?? null);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, view]);

  const run = async () => {
    if (!brandId || running) return;
    setRunning(true);
    setError(null);
    try {
      const res = await api.post(`/brands/${brandId}/audit/store`);
      setView(res.data?.data?.storeAudit ?? null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'The product page audit failed. Please try again.');
    } finally {
      setRunning(false);
    }
  };

  const products = view?.pages.filter((p) => p.kind === 'product') ?? [];
  const collections = view?.pages.filter((p) => p.kind === 'collection') ?? [];
  const sticky = { position: 'sticky' as const, left: 0, width: boxWidth ? boxWidth - 24 : undefined, maxWidth: '100%' };

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3>Product pages</h3>
          <p className="sub" style={{ marginBottom: 0 }}>How ready your product pages are for AI engines: schema, price, reviews, description, FAQ, image alt text, title and meta.</p>
        </div>
        <button type="button" className="btn" onClick={run} disabled={running || !brandId}>{running ? 'Auditing…' : view ? 'Audit again' : 'Audit product pages'}</button>
      </div>
      {running && <ScanProgress title="Auditing your product pages" hint="Reading each product and collection page the way AI crawlers do. This takes up to a minute." />}
      {error && <p style={{ color: 'var(--bad)', fontSize: '13px' }}>{error}</p>}

      {!running && view && (
        <>
          <div style={{ margin: '14px 0 6px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
            {view.score !== null ? <Pill score={view.score} big /> : <span style={small}>No product page could be scored.</span>}
            <span style={small}>
              {products.length} product page{products.length === 1 ? '' : 's'} from {SOURCE[view.source]}
              {timeAgo(view.checkedAt) ? ` · checked ${timeAgo(view.checkedAt)}` : ''}
            </span>
          </div>

          {products.length === 0 ? (
            <p className="sub">No product pages were found. Save your products in Settings → Products, or check that your store has a sitemap.</p>
          ) : (
            <div ref={boxRef} style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr><th>Page</th><th>Score</th>{PRODUCT_COLS.map((k) => <th key={k}>{COL_LABELS[k]}</th>)}</tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <Fragment key={p.url}>
                      <tr onClick={() => setOpen(open === p.url ? null : p.url)} style={{ cursor: 'pointer' }}>
                        <td style={{ maxWidth: 220, overflowWrap: 'anywhere' }}><strong>{p.name}</strong></td>
                        <td>{p.score !== null ? <Pill score={p.score} /> : <span style={{ ...small, color: 'var(--bad)' }}>couldn't open</span>}</td>
                        {PRODUCT_COLS.map((k) => <td key={k}>{p.error ? <span style={small}>—</span> : <Mark c={p.checks.find((c) => c.key === k)} />}</td>)}
                      </tr>
                      {open === p.url && (
                        <tr><td colSpan={2 + PRODUCT_COLS.length}><div style={sticky}><Details page={p} /></div></td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {collections.length > 0 && (
            <>
              <h3 style={{ marginTop: '22px' }}>Collection pages</h3>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Collection</th><th>Schema</th><th>Description</th><th>Title & meta</th></tr></thead>
                  <tbody>
                    {collections.map((p) => (
                      <Fragment key={p.url}>
                        <tr onClick={() => setOpen(open === p.url ? null : p.url)} style={{ cursor: 'pointer' }}>
                          <td style={{ maxWidth: 220, overflowWrap: 'anywhere' }}><strong>{p.name}</strong></td>
                          {['schema', 'description', 'meta'].map((k) => <td key={k}>{p.error ? <span style={small}>—</span> : <Mark c={p.checks.find((c) => c.key === k)} />}</td>)}
                        </tr>
                        {open === p.url && <tr><td colSpan={4}><div style={sticky}><Details page={p} /></div></td></tr>}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p style={{ ...small, marginTop: '10px' }}>Click a page to see what each check found and how to fix it.</p>
        </>
      )}
      {!running && !view && !error && <p className="sub" style={{ marginTop: '10px' }}>Not audited yet. It also runs with every website audit.</p>}
    </div>
  );
}
