import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import api from '../utils/axios';
import ScanProgress from './ScanProgress';
import { timeAgo } from '../utils/timeAgo';

type Level = 'good' | 'warn' | 'bad';
type Key = 'description' | 'title' | 'brand' | 'image' | 'images' | 'price' | 'stock' | 'category' | 'gtin';
interface FeedCheck { key: Key; label: string; pass: boolean | null; points: number; max: number; detail: string }
interface FeedProduct { url: string; name: string; score: number; level: Level; checks: FeedCheck[] }
export interface FeedHealth { checkedAt: string; shopify: boolean; total: number; score: number | null; summary: Array<{ key: Key; label: string; failing: number }>; products: FeedProduct[]; truncated?: boolean; partial?: boolean }

const LEVEL_COLORS: Record<Level, React.CSSProperties> = {
  good: { background: 'rgba(74,222,128,0.13)', color: 'var(--good)' },
  warn: { background: 'var(--amber-soft)', color: 'var(--amber)' },
  bad: { background: 'rgba(248,113,113,0.13)', color: 'var(--bad)' },
};
const levelOf = (score: number): Level => (score >= 80 ? 'good' : score >= 50 ? 'warn' : 'bad');
// "125 of 203 products have no category": one sentence per gap
const GAP: Record<Key, string> = {
  description: 'have a description under 50 words',
  title: 'have a title that is too short, too long or in capitals',
  brand: 'have no brand (vendor)',
  image: 'have no JPEG or PNG main image',
  images: 'have fewer than 2 images',
  price: 'have a price problem (₹0, or an MRP below the price)',
  stock: 'are out of stock',
  category: 'have no category (product type)',
  gtin: '',
};
// What to change in Shopify admin for each gap
const TIP: Record<Key, string> = {
  description: 'AI shopping feeds need a real description: write 50+ words of plain text (what it is, notes or ingredients, size, who it is for) in Products → this product → Description.',
  title: 'Use a title of 15–150 characters in normal case, with the product name and its kind (e.g. "Silk Oud Alcohol Free Attar 12ml"), in Products → Title.',
  brand: 'Set the brand in Products → this product → Vendor; feeds need it on every product.',
  image: 'Add a main product image in JPEG or PNG (feeds may skip WebP or missing images) in Products → Media.',
  images: 'Add at least 2 images (front, box or in use) in Products → Media; AI shopping shows products with more views.',
  price: 'Check the price in Products → Pricing: it must be above 0, and "Compare-at price" (MRP) must not be lower than the price.',
  stock: "Every variant is out of stock, so feeds list it as unavailable and AI won't recommend it. Update stock in Products → this product → Inventory, or hide the product if it is discontinued.",
  category: 'Set a Product type (e.g. "Attar", "Perfume") in Products → Product organization, so AI can place the product in the right category.',
  gtin: '',
};
const COLS: Key[] = ['description', 'title', 'brand', 'image', 'images', 'price', 'stock', 'category'];
const COL_LABELS: Record<Key, string> = { description: 'Description', title: 'Title', brand: 'Brand', image: 'Image', images: 'Images', price: 'Price', stock: 'Stock', category: 'Category', gtin: 'GTIN' };
const PAGE = 50;
const small: React.CSSProperties = { fontSize: '12px', color: 'var(--text-faint)' };

const Mark = ({ c }: { c?: FeedCheck }) =>
  !c || c.pass === null
    ? <span style={small}>—</span>
    : <span style={{ color: c.pass ? 'var(--good)' : 'var(--bad)', fontWeight: 700 }} title={c.detail}>{c.pass ? '✓' : '✗'}</span>;

const Pill = ({ score, big }: { score: number; big?: boolean }) => (
  <span style={{ ...LEVEL_COLORS[levelOf(score)], display: 'inline-block', padding: big ? '6px 14px' : '2px 9px', borderRadius: '20px', fontSize: big ? '16px' : '12.5px', fontWeight: 700 }}>
    {big ? `Feed score ${score}/100` : score}
  </span>
);

// onChecked: a new result was saved, so the Products table's Feed column can reload
export default function FeedHealthPanel({ brandId, onChecked }: { brandId?: string; onChecked?: () => void }) {
  const [feed, setFeed] = useState<FeedHealth | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  // Opened details stay as wide as the visible part of the table, so nothing is cut off on phones
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState<number | null>(null);
  useEffect(() => {
    const measure = () => setBoxWidth(boxRef.current?.clientWidth ?? null);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, feed]);

  // The saved result from the latest website audit or check
  const load = useCallback(async () => {
    if (!brandId) return;
    try {
      const res = await api.get(`/brands/${brandId}/products/feed`);
      setFeed(res.data?.data?.feedHealth ?? null);
    } catch {
      setFeed(null);
    }
  }, [brandId]);
  useEffect(() => { load(); }, [load]);

  const check = async () => {
    if (!brandId || running) return;
    setRunning(true); setError(''); setNote('');
    try {
      const res = await api.post(`/brands/${brandId}/products/feed`);
      const data = res.data?.data;
      setFeed(data?.feedHealth ?? null);
      if (data?.failed) setNote("Couldn't read your store's catalogue just now; showing the last result. Try again in 10 minutes.");
      else if (data && !data.fresh) setNote(data.feedHealth ? 'Checked less than 10 minutes ago; showing that result.' : 'Checked less than 10 minutes ago. Try again in a few minutes.');
      else if (data && !data.saved) setNote('Run the website audit once so this result is saved.');
      if (data?.fresh && data.saved) onChecked?.();
    } catch (err: any) {
      setError(err.response?.data?.message || 'The feed check failed. Please try again.');
    } finally {
      setRunning(false);
    }
  };

  const products = (feed?.products ?? []).filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  const sticky = { position: 'sticky' as const, left: 0, width: boxWidth ? boxWidth - 24 : undefined, maxWidth: '100%' };

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3>Product feed health</h3>
          <p className="sub" style={{ marginBottom: 0 }}>AI shopping (like ChatGPT Shopping) picks products from their data: description, title, brand, images, price, stock and category.</p>
        </div>
        <button type="button" className="btn" onClick={check} disabled={running || !brandId}>{running ? 'Checking…' : feed ? 'Check again' : 'Check feed'}</button>
      </div>
      {running && <ScanProgress engines={false} title="Checking your product data" hint="Reading your store's product catalogue. This takes a few seconds." />}
      {error && <p style={{ color: 'var(--bad)', fontSize: '13px' }}>{error}</p>}
      {note && <p style={small}>{note}</p>}

      {!running && feed && !feed.shopify && (
        <p className="sub" style={{ marginTop: '10px' }}>The feed check needs a Shopify store: we read the product catalogue Shopify publishes. Your store's catalogue wasn't found.</p>
      )}

      {!running && feed?.shopify && (
        <>
          <div style={{ margin: '14px 0 6px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
            {feed.score !== null ? <Pill score={feed.score} big /> : <span style={small}>No products found.</span>}
            <span style={small}>{feed.truncated ? 'First ' : ''}{feed.total} product{feed.total === 1 ? '' : 's'}{timeAgo(feed.checkedAt) ? ` · checked ${timeAgo(feed.checkedAt)}` : ''}</span>
          </div>
          {feed.truncated && <p style={small}>Your store has more than 1,000 products; the first 1,000 were checked.</p>}
          {feed.partial && <p style={small}>Part of your catalogue couldn't be read during this check, so some products are missing. Check again to complete it.</p>}
          {feed.summary.length > 0 && (
            <ul style={{ margin: '8px 0 12px', paddingLeft: '18px', fontSize: '13.5px' }}>
              {feed.summary.slice(0, 5).map((s) => (
                <li key={s.key}><strong>{s.failing} of {feed.total}</strong> products {GAP[s.key]}</li>
              ))}
            </ul>
          )}
          <p style={small}>GTIN / barcode: connect Shopify to check (not in the public catalogue).</p>

          {feed.products.length > 0 && (
            <>
              <input value={search} placeholder="Search products" onChange={(e) => { setSearch(e.target.value); setShown(PAGE); }} style={{ width: '100%', maxWidth: 320, margin: '6px 0' }} aria-label="Search products" />
              <div ref={boxRef} style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Product</th><th>Score</th>{COLS.map((k) => <th key={k}>{COL_LABELS[k]}</th>)}</tr></thead>
                  <tbody>
                    {products.slice(0, shown).map((p) => (
                      <Fragment key={p.url}>
                        <tr onClick={() => setOpen(open === p.url ? null : p.url)} style={{ cursor: 'pointer' }}>
                          <td style={{ maxWidth: 220, overflowWrap: 'break-word' }}><strong>{p.name}</strong></td>
                          <td><Pill score={p.score} /></td>
                          {COLS.map((k) => <td key={k}><Mark c={p.checks.find((c) => c.key === k)} /></td>)}
                        </tr>
                        {open === p.url && (
                          <tr><td colSpan={2 + COLS.length}>
                            <div style={{ ...sticky, fontSize: '12.5px' }}>
                              <a href={p.url} target="_blank" rel="noreferrer" style={{ overflowWrap: 'anywhere' }}>{p.url}</a>
                              {p.checks.map((c) => (
                                <div key={c.key} style={{ margin: '6px 0' }}>
                                  <Mark c={c} /> <strong>{c.label}</strong> <span style={small}>· {c.detail}</span>
                                  {c.pass === false && TIP[c.key] && <div style={{ ...small, marginLeft: '16px' }}>{TIP[c.key]}</div>}
                                </div>
                              ))}
                            </div>
                          </td></tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {products.length > shown && (
                <button type="button" className="btn btn-ghost" style={{ marginTop: '8px' }} onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, products.length - shown)} more of {products.length - shown}</button>
              )}
              {!products.length && <p style={small}>No products match.</p>}
            </>
          )}
        </>
      )}
      {!running && !feed && !error && <p className="sub" style={{ marginTop: '10px' }}>Not checked yet. It also runs with every website audit.</p>}
    </div>
  );
}
