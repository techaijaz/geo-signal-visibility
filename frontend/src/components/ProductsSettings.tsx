import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../utils/axios';

export interface Product {
  shopifyId: string | null;
  title: string;
  shortName: string;
  aliases: string[];
  url: string;
  price: number | null;
  image: string;
  productType: string;
  nameEditedByUser: boolean;
}
interface Candidate extends Product { hidden: boolean; hiddenReason: string }

const rupees = (p: number | null) => (p ? `₹${Math.round(p).toLocaleString('en-IN')}` : '');
const errorOf = (err: any, fallback: string) => err?.response?.data?.message || fallback;
// Only the fields the API accepts
const clean = ({ shopifyId, title, shortName, aliases, url, price, image, productType, nameEditedByUser }: Product): Product =>
  ({ shopifyId, title, shortName, aliases, url, price, image, productType, nameEditedByUser });

const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', padding: '8px 0', borderTop: '1px solid var(--line)' };
const thumb: React.CSSProperties = { width: 36, height: 36, borderRadius: 6, objectFit: 'cover', background: 'var(--line)', flex: '0 0 36px' };
const text: React.CSSProperties = { flex: '1 1 200px', minWidth: 0, overflowWrap: 'anywhere' };
const small: React.CSSProperties = { fontSize: '12px', color: 'var(--text-faint)' };

export default function ProductsSettings({ brandId }: { brandId?: string }) {
  const [saved, setSaved] = useState<Product[]>([]);
  const [maxProducts, setMaxProducts] = useState(3);
  const [mode, setMode] = useState<'list' | 'pick' | 'review'>('list');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [review, setReview] = useState<Product[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState({ shortName: '', aliases: '' });
  const [manual, setManual] = useState<{ open: boolean; shortName: string; url: string; price: string }>({ open: false, shortName: '', url: '', price: '' });
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    if (!brandId) return;
    try {
      const res = await api.get(`/brands/${brandId}/products`);
      setSaved(res.data?.data?.products ?? []);
      setMaxProducts(res.data?.data?.maxProducts ?? 3);
    } catch (err) {
      setError(errorOf(err, "Couldn't load your products."));
    }
  }, [brandId]);
  useEffect(() => { load(); }, [load]);

  // Every change is saved at once; on an error the previous list stays
  const save = async (next: Product[]) => {
    if (!brandId) return false;
    setError('');
    setNote(''); // an old "updated from Shopify" line must not stay under a later change
    setBusy('save');
    try {
      const res = await api.put(`/brands/${brandId}/products`, { products: next.map(clean) });
      setSaved(res.data?.data?.products ?? next);
      return true;
    } catch (err) {
      setError(errorOf(err, "Couldn't save your products."));
      return false;
    } finally {
      setBusy('');
    }
  };

  const startImport = async () => {
    if (!brandId) return;
    setError(''); setNote(''); setBusy('import');
    try {
      // Read the saved list again: if Import is clicked before the first load finished, `saved` is still empty
      // and saving the picker would drop the products already saved
      const current: Product[] = (await api.get(`/brands/${brandId}/products`)).data?.data?.products ?? saved;
      setSaved(current);
      const res = await api.post(`/brands/${brandId}/products/import`, {});
      const data = res.data?.data;
      if (!data?.shopify) {
        setNote('Shopify store not found. Add products manually.');
        setManual((m) => ({ ...m, open: true }));
        return;
      }
      setCandidates(data.products ?? []);
      setTruncated(!!data.truncated);
      setPicked(new Set((data.products ?? []).filter((c: Candidate) => current.some((s) => s.shopifyId && s.shopifyId === c.shopifyId)).map((c: Candidate) => c.url)));
      setSearch(''); setShowHidden(false); setMode('pick');
    } catch (err) {
      setError(errorOf(err, "Couldn't read your store's products."));
    } finally {
      setBusy('');
    }
  };

  const refresh = async () => {
    if (!brandId) return;
    setError(''); setNote(''); setBusy('refresh');
    try {
      const res = await api.post(`/brands/${brandId}/products/refresh`, {});
      setSaved(res.data?.data?.products ?? saved);
      setNote('Prices, links and photos updated from Shopify.');
    } catch (err) {
      setError(errorOf(err, "Couldn't refresh from Shopify."));
    } finally {
      setBusy('');
    }
  };

  // Saved products that did not come from this import stay; picked ones replace their saved copy
  const others = useMemo(() => saved.filter((s) => !s.shopifyId || !candidates.some((c) => c.shopifyId === s.shopifyId)), [saved, candidates]);
  const room = maxProducts - others.length;
  const visible = candidates.filter((c) => (showHidden || !c.hidden) && (!search || c.title.toLowerCase().includes(search.toLowerCase())));
  const hiddenCount = candidates.filter((c) => c.hidden).length;

  const toggle = (url: string) => setPicked((p) => {
    const next = new Set(p);
    if (next.has(url)) next.delete(url); else if (next.size < room) next.add(url);
    return next;
  });

  // One AI call cleans the names; any failure keeps the rule names and never blocks
  const toReview = async () => {
    if (!brandId) return;
    const chosen = candidates.filter((c) => picked.has(c.url)).map((c) => {
      const kept = saved.find((s) => s.shopifyId && s.shopifyId === c.shopifyId);
      return kept ? { ...clean(c), shortName: kept.shortName, aliases: kept.aliases, nameEditedByUser: kept.nameEditedByUser } : clean(c);
    });
    setNote(''); setBusy('names');
    const needNames = chosen.filter((c) => !c.nameEditedByUser);
    if (needNames.length) {
      try {
        const res = await api.post(`/brands/${brandId}/products/short-names`, { titles: needNames.map((c) => c.title) });
        const names: Array<string | null> = res.data?.data?.names ?? [];
        needNames.forEach((c, i) => { if (names[i]) c.shortName = names[i] as string; });
      } catch (err) {
        setNote(errorOf(err, 'AI names are not available right now. The names below come from your titles.'));
      }
    }
    setBusy('');
    setReview(chosen);
    setMode('review');
  };

  const finishReview = async () => {
    if (await save([...others, ...review])) { setMode('list'); setCandidates([]); }
  };

  const addManual = async () => {
    const shortName = manual.shortName.trim();
    if (shortName.length < 2) { setError('Write the product name (at least 2 letters).'); return; }
    // "yourstore.com/products/x" is fine: the scheme is added; anything that is still not a link is refused here
    let url = manual.url.trim();
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    if (url) {
      // new URL() also encodes spaces, so "…/rose attar" is sent as a valid link
      try { url = new URL(url).href; } catch { setError('Enter the product link like https://yourstore.com/products/silk-oud, or leave it empty.'); return; }
      if (!/^https?:\/\/[^/\s]+\.[^/\s]+/i.test(url)) { setError('Enter the product link like https://yourstore.com/products/silk-oud, or leave it empty.'); return; }
    }
    const price = parseFloat(manual.price);
    const product: Product = {
      shopifyId: null, title: shortName, shortName, aliases: [], url,
      price: isNaN(price) ? null : price, image: '', productType: '', nameEditedByUser: true
    };
    if (await save([...saved, product])) setManual({ open: false, shortName: '', url: '', price: '' });
  };

  const saveEdit = async (i: number) => {
    const shortName = draft.shortName.trim();
    if (shortName.length < 2) { setError('Write the product name (at least 2 letters).'); return; }
    const aliases = draft.aliases.split(',').map((a) => a.trim()).filter((a) => a.length >= 2).slice(0, 3);
    const next = saved.map((p, j) => (j === i ? { ...p, shortName, aliases, nameEditedByUser: true } : p));
    if (await save(next)) setEditing(null);
  };

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3>Products</h3>
          <p className="sub">AI answers are searched for these names. Your plan tracks up to {maxProducts} products.</p>
        </div>
        {mode === 'list' && (
          <span style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={startImport} disabled={!!busy}>{busy === 'import' ? 'Reading store…' : 'Import from Shopify'}</button>
            {saved.some((p) => p.shopifyId) && (
              <button type="button" className="btn btn-ghost" onClick={refresh} disabled={!!busy}>{busy === 'refresh' ? 'Refreshing…' : 'Refresh from Shopify'}</button>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => setManual((m) => ({ ...m, open: !m.open }))} disabled={!!busy}>Add manually</button>
          </span>
        )}
      </div>

      {error && <p className="error-text" style={{ color: '#ef4444' }}>{error}</p>}
      {note && <p className="sub" style={{ margin: '6px 0' }}>{note}</p>}

      {mode === 'list' && (
        <>
          {manual.open && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end', margin: '8px 0 12px' }}>
              <div className="field" style={{ flex: '1 1 180px', marginBottom: 0 }}>
                <label>Product name</label>
                <input value={manual.shortName} placeholder="Silk Oud" onChange={(e) => setManual({ ...manual, shortName: e.target.value })} />
              </div>
              <div className="field" style={{ flex: '2 1 220px', marginBottom: 0 }}>
                <label>Link (optional)</label>
                <input value={manual.url} placeholder="https://yourstore.com/products/silk-oud" onChange={(e) => setManual({ ...manual, url: e.target.value })} />
              </div>
              <div className="field" style={{ flex: '0 1 110px', marginBottom: 0 }}>
                <label>Price ₹ (optional)</label>
                <input value={manual.price} inputMode="decimal" onChange={(e) => setManual({ ...manual, price: e.target.value })} />
              </div>
              <button type="button" className="btn btn-primary" onClick={addManual} disabled={!!busy || saved.length >= maxProducts}>Add</button>
            </div>
          )}

          {!saved.length && <p className="sub" style={{ margin: '8px 0 0' }}>No products yet. Import them from your Shopify store or add them by hand.</p>}
          {saved.map((p, i) => (
            <div key={`${p.shopifyId ?? 'm'}-${p.url}-${i}`} style={{ ...row, opacity: i >= maxProducts ? 0.5 : 1 }}>
              {p.image ? <img src={p.image} alt="" style={thumb} /> : <span style={thumb} />}
              {editing === i ? (
                <span style={{ ...text, display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  <input value={draft.shortName} onChange={(e) => setDraft({ ...draft, shortName: e.target.value })} style={{ flex: '1 1 140px' }} aria-label="Short name" />
                  <input value={draft.aliases} placeholder="Other names, comma separated" onChange={(e) => setDraft({ ...draft, aliases: e.target.value })} style={{ flex: '2 1 180px' }} aria-label="Other names" />
                </span>
              ) : (
                <span style={text}>
                  <strong>{p.shortName}</strong> {p.price ? <span style={small}>· {rupees(p.price)}</span> : null}
                  {i >= maxProducts && <span style={small}> · upgrade to track</span>}
                  <br /><span style={small}>{p.title}</span>
                  {p.aliases.length > 0 && <span style={{ marginLeft: 6 }}>{p.aliases.map((a) => <span key={a} className="tag" style={{ marginRight: 4 }}>{a}</span>)}</span>}
                </span>
              )}
              {editing === i ? (
                <span style={{ display: 'flex', gap: '6px' }}>
                  <button type="button" className="btn btn-primary" onClick={() => saveEdit(i)} disabled={!!busy}>Save</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                </span>
              ) : (
                <span style={{ display: 'flex', gap: '6px' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => { setEditing(i); setDraft({ shortName: p.shortName, aliases: p.aliases.join(', ') }); }}>Edit</button>
                  <button type="button" className="btn btn-ghost" onClick={() => save(saved.filter((_, j) => j !== i))} disabled={!!busy}>Remove</button>
                </span>
              )}
            </div>
          ))}
        </>
      )}

      {mode === 'pick' && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', margin: '6px 0' }}>
            <input value={search} placeholder="Search your products" onChange={(e) => setSearch(e.target.value)} style={{ flex: '1 1 220px' }} aria-label="Search products" />
            <span style={small}>{picked.size} of {Math.max(room, 0)} picked · Your plan allows {maxProducts} products</span>
          </div>
          {truncated && <p style={small}>Showing the first 1000 products. Use search.</p>}
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {visible.map((c) => {
              const on = picked.has(c.url);
              return (
                <label key={c.url} style={{ ...row, cursor: 'pointer', opacity: !on && picked.size >= room ? 0.5 : 1 }}>
                  <input type="checkbox" checked={on} disabled={!on && picked.size >= room} onChange={() => toggle(c.url)} />
                  {c.image ? <img src={c.image} alt="" style={thumb} /> : <span style={thumb} />}
                  <span style={text}>
                    <strong>{c.shortName}</strong> <span style={small}>· {rupees(c.price)}{c.hidden ? ` · ${c.hiddenReason}` : ''}</span>
                    <br /><span style={small}>{c.title}</span>
                  </span>
                </label>
              );
            })}
            {!visible.length && <p style={small}>No products match.</p>}
          </div>
          {hiddenCount > 0 && (
            <button type="button" className="btn btn-ghost" style={{ paddingLeft: 0 }} onClick={() => setShowHidden(!showHidden)}>
              {showHidden ? 'Hide' : 'Show'} {hiddenCount} hidden items (samples, free gifts, duplicates)
            </button>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button type="button" className="btn btn-primary" onClick={toReview} disabled={!picked.size || !!busy}>{busy === 'names' ? 'Cleaning names…' : 'Next'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setMode('list'); setCandidates([]); }}>Cancel</button>
          </div>
        </>
      )}

      {mode === 'review' && (
        <>
          <p className="sub" style={{ margin: '6px 0' }}>Check each name. AI answers are searched for exactly these words.</p>
          {review.map((p, i) => (
            <div key={p.url} style={row}>
              {p.image ? <img src={p.image} alt="" style={thumb} /> : <span style={thumb} />}
              <span style={text}>
                <input
                  value={p.shortName}
                  aria-label={`Name for ${p.title}`}
                  onChange={(e) => setReview(review.map((r, j) => (j === i ? { ...r, shortName: e.target.value, nameEditedByUser: true } : r)))}
                  style={{ width: '100%', maxWidth: 260 }}
                />
                <br /><span style={small}>{p.title}</span>
              </span>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button type="button" className="btn btn-primary" onClick={finishReview} disabled={!!busy || review.some((r) => r.shortName.trim().length < 2)}>
              {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setMode('pick')}>Back</button>
          </div>
        </>
      )}
    </div>
  );
}
