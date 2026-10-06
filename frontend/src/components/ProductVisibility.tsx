import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/axios';
import { usePlanLimits } from '../hooks/usePlanLimits';

interface Hit { queryText: string; model: string; position: number | null; line: string }
interface Row {
  shortName: string; title: string; url: string; price: number | null; image: string;
  answers: number; previousAnswers: number | null; bestPosition: number | null; models: string[];
  hits: Hit[]; genericName: boolean; overLimit: boolean;
}
interface Question { text: string; lang: string; intent: string }
interface Visibility {
  totalAnswers: number; textAvailable: boolean; counted: number; notSeen: number;
  products: Row[]; suggestions: Record<string, Question[]>;
}

function useProductVisibility(brandId?: string) {
  const [data, setData] = useState<Visibility | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!brandId) return;
    try {
      const res = await api.get(`/brands/${brandId}/products/visibility`);
      setData(res.data?.data ?? null);
      setError('');
    } catch {
      setError("Couldn't load product results.");
    }
  }, [brandId]);
  useEffect(() => { load(); }, [load]);
  return { data, error, load };
}

const pos = (p: number | null) => (p ? `#${p}` : '—');
const rupees = (p: number | null) => (p ? `₹${Math.round(p).toLocaleString('en-IN')}` : '');
const thumb: React.CSSProperties = { width: 32, height: 32, borderRadius: 6, objectFit: 'cover', background: 'var(--line)', flex: '0 0 32px' };
const small: React.CSSProperties = { fontSize: '12px', color: 'var(--text-faint)' };

const change = (r: Row) => {
  if (r.previousAnswers === null || r.previousAnswers === r.answers) return null;
  return r.answers > r.previousAnswers
    ? <span style={{ color: 'var(--good, #34d399)' }}>↑ from {r.previousAnswers}</span>
    : <span style={{ color: 'var(--bad)' }}>↓ from {r.previousAnswers}</span>;
};

function Details({ row, brandId, questions, onAdded }: { row: Row; brandId: string; questions: Question[]; onAdded: () => void }) {
  const [msg, setMsg] = useState('');
  const [added, setAdded] = useState<Set<string>>(new Set());

  // Adds the question to the brand's tracked queries; the plan's query limit is checked by the server
  const add = async (q: Question) => {
    setMsg('');
    try {
      const brand = (await api.get(`/brands/${brandId}`)).data?.data;
      const queries = brand?.queries ?? [];
      await api.patch(`/brands/${brandId}`, { queries: [...queries, { text: q.text, lang: q.lang, intent: q.intent, enabled: true }] });
      setAdded(new Set(added).add(q.text));
      setMsg('Added. It is asked in your next scan.');
      onAdded();
    } catch (err: any) {
      setMsg(err.response?.data?.message || "Couldn't add this question.");
    }
  };

  if (row.overLimit) return <p style={small}>Your plan does not track this product. <Link to="/billing">Upgrade to track</Link></p>;
  if (row.genericName) return <p style={small}>“{row.shortName}” is too common to count. Make it more specific in <Link to="/settings">Settings → Products</Link>.</p>;
  if (row.hits.length) {
    return (
      <div>
        {row.hits.map((h, i) => (
          <div key={i} style={{ margin: '6px 0' }}>
            <div style={{ fontSize: '12.5px' }}>{h.model} · {pos(h.position)} · “{h.queryText}”</div>
            {h.line && <div style={{ ...small, overflowWrap: 'anywhere' }}>{h.line}</div>}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ fontSize: '12.5px' }}>
      {questions.length > 0 && (
        <>
          <div style={{ margin: '4px 0' }}>Questions that name this kind of product help AI pick it:</div>
          {questions.map((q) => (
            <div key={q.text} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
              <span style={{ flex: '1 1 200px', minWidth: 0 }}>{q.text}</span>
              <button type="button" className="btn" style={{ padding: '2px 10px', fontSize: '12px' }} disabled={added.has(q.text)} onClick={() => add(q)}>
                {added.has(q.text) ? 'Added' : 'Add'}
              </button>
            </div>
          ))}
        </>
      )}
      {row.url && <div style={{ marginTop: '6px' }}><Link to={`/audit?product=${encodeURIComponent(row.url)}`}>Check this page →</Link> <span style={small}>See what AI crawlers read on it.</span></div>}
      {msg && <p style={small}>{msg}</p>}
    </div>
  );
}

// One click: the most useful product questions (price + occasion of each not-seen product), within the plan's limit
function AddTopQuestions({ brandId, suggestions, onAdded }: { brandId: string; suggestions: Record<string, Question[]>; onAdded: () => void }) {
  const { limits } = usePlanLimits();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // English-only plans get the English questions; then one question per product before a second one
  const english = !!limits && !(limits.allowedLanguages || []).some((l) => l.toLowerCase().startsWith('hi'));
  const lists = Object.values(suggestions).map((qs) => qs.filter((q) => !english || q.lang === 'EN').slice(0, 2));
  const picks = [0, 1].flatMap((i) => lists.map((qs) => qs[i]).filter((q): q is Question => !!q));
  if (!picks.length) return null;

  const addTop = async () => {
    setBusy(true); setMsg('');
    try {
      const brand = (await api.get(`/brands/${brandId}`)).data?.data;
      const queries: Array<{ text: string; enabled?: boolean }> = brand?.queries ?? [];
      const used = queries.filter((q) => q.enabled !== false).length;
      const room = Math.max((limits?.maxQueries ?? 0) - used, 0);
      const have = new Set(queries.map((q) => q.text.trim().toLowerCase()));
      const add = picks.filter((q) => !have.has(q.text.trim().toLowerCase())).slice(0, room);
      if (!add.length) { setMsg(room ? 'These questions are already tracked.' : "Your plan's question limit is full. Remove a question in Settings or upgrade."); return; }
      await api.patch(`/brands/${brandId}`, { queries: [...queries, ...add.map((q) => ({ text: q.text, lang: q.lang, intent: q.intent, enabled: true }))] });
      setMsg(`Added ${add.length} question${add.length === 1 ? '' : 's'}. They are asked in your next scan.`);
      onAdded();
    } catch (err: any) {
      setMsg(err.response?.data?.message || "Couldn't add the questions.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', margin: '0 0 12px' }}>
      <button type="button" className="btn" onClick={addTop} disabled={busy || !limits}>{busy ? 'Adding…' : 'Add top product questions'}</button>
      <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>{msg || 'Budget and occasion questions for products AI did not name, within your plan.'}</span>
    </div>
  );
}

export function ProductsTable({ brandId }: { brandId?: string }) {
  const { data, error, load } = useProductVisibility(brandId);
  const [open, setOpen] = useState<string | null>(null);
  // The opened details stay as wide as the visible part of the table, so nothing is cut off on phones
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState<number | null>(null);
  useEffect(() => {
    const measure = () => setBoxWidth(boxRef.current?.clientWidth ?? null);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, data]);

  if (error) return <div className="panel"><p style={{ color: 'var(--bad)', fontSize: '13px' }}>{error}</p></div>;
  if (!data || !brandId) return null;
  if (!data.products.length) {
    return (
      <div className="panel">
        <p style={{ fontSize: '13.5px' }}>Import your products to see which ones AI recommends. <Link to="/settings">Go to Settings → Products</Link></p>
      </div>
    );
  }
  if (!data.textAvailable) return <div className="panel"><p className="sub">Results after your next scan.</p></div>;

  return (
    <div className="panel">
      {data.products.every((r) => !r.answers) ? (
        <p style={{ fontSize: '13.5px', margin: '0 0 12px' }}>
          None of your products was named in the last {data.totalAnswers} {data.totalAnswers === 1 ? 'answer' : 'answers'}. Questions that name a product type and budget help. Open a product below.
        </p>
      ) : (
        <p className="sub">
          {data.products.filter((r) => r.answers).length} of {data.counted} {data.counted === 1 ? 'product was' : 'products were'} named in the last {data.totalAnswers}{' '}
          {data.totalAnswers === 1 ? 'answer' : 'answers'}.
        </p>
      )}
      <AddTopQuestions brandId={brandId} suggestions={data.suggestions} onAdded={load} />
      <div ref={boxRef} style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Product</th><th>AI answers</th><th>Best</th><th>AI engines</th><th>Last scan</th></tr></thead>
          <tbody>
            {data.products.map((r) => (
              <Fragment key={r.shortName}>
                <tr onClick={() => setOpen(open === r.shortName ? null : r.shortName)} style={{ cursor: 'pointer', opacity: r.overLimit ? 0.5 : 1 }}>
                  <td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {r.image ? <img src={r.image} alt="" style={thumb} /> : <span style={thumb} />}
                      <span><strong>{r.shortName}</strong> <span style={small}>{rupees(r.price)}</span></span>
                    </span>
                  </td>
                  <td className="mono">
                    {r.overLimit ? <span style={small}>upgrade</span> : r.answers ? `${r.answers}/${data.totalAnswers}` : <span className="tag">Not seen</span>}
                  </td>
                  <td className="mono">{pos(r.bestPosition)}</td>
                  <td>{r.models.map((m) => <span key={m} className="tag" style={{ marginRight: 4 }}>{m}</span>)}</td>
                  <td style={{ fontSize: '12px' }}>{change(r)}</td>
                </tr>
                {open === r.shortName && (
                  <tr>
                    <td colSpan={5}>
                      {/* Stays in view on phones while the table itself scrolls sideways */}
                      <div style={{ position: 'sticky', left: 0, width: boxWidth ? boxWidth - 24 : undefined, maxWidth: '100%', overflowWrap: 'anywhere' }}>
                        <Details row={r} brandId={brandId} questions={data.suggestions[r.shortName] ?? []} onAdded={load} />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ProductsCard({ brandId }: { brandId?: string }) {
  const { data, error } = useProductVisibility(brandId);
  if (error) return <div className="panel"><h3>Your products in AI answers</h3><p style={{ color: 'var(--bad)', fontSize: '13px' }}>{error}</p></div>;
  if (!data || !data.products.length) return null;
  const named = data.products.filter((r) => r.answers > 0).slice(0, 3);
  return (
    <div className="panel">
      <h3>Your products in AI answers</h3>
      {!data.textAvailable ? (
        <p className="sub">Results after your next scan.</p>
      ) : (
        <>
          {named.map((r) => (
            <div key={r.shortName} style={{ fontSize: '13.5px', margin: '4px 0' }}>
              <strong>{r.shortName}</strong> <span className="mono">· {r.answers}/{data.totalAnswers} · best {pos(r.bestPosition)}</span>
            </div>
          ))}
          {data.notSeen > 0 && (
            <p className="sub" style={{ margin: '8px 0 0' }}>{data.notSeen} of {data.counted} products were not named in any AI answer.</p>
          )}
          <div style={{ textAlign: 'right', marginTop: '10px', fontSize: '13px' }}><Link to="/products">See all →</Link></div>
        </>
      )}
    </div>
  );
}
