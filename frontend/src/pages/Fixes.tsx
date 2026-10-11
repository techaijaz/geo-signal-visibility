import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import api from '../utils/axios';

// Feature #13: FAQ and "Brand vs Competitor" pages written from the brand's own product pages,
// with sources and [confirm] marks the owner fills in before publishing

type FixType = 'faq' | 'comparison';
type FixLanguage = 'en' | 'hi-en' | 'hi';

interface FixItem {
  question?: string;
  answer?: string;
  heading?: string;
  body?: string;
  rows?: Array<{ label: string; brand: string; competitor: string }>;
  source?: string;
}

interface Fix {
  _id: string;
  type: FixType;
  kind?: string | null;
  competitor?: string | null;
  language: FixLanguage;
  status: 'pending' | 'done' | 'failed';
  error?: string | null;
  note?: string | null;
  title?: string | null;
  items: FixItem[];
  createdAt: string;
  outputs: { text: string; html: string; jsonLd: string | null } | null;
}

interface FixesData {
  fixes: Fix[];
  usage: { used: number; limit: number; resetsOn: string };
  kinds: Array<{ kind: string; count: number }>;
  competitors: string[];
}

interface OutletContextType {
  currentBrand: { _id?: string; name: string };
}

const LANGUAGES: Array<{ value: FixLanguage; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'hi-en', label: 'Hinglish' },
  { value: 'hi', label: 'हिंदी' },
];
const POLL_MS = 3000;
const POLL_GIVE_UP_MS = 3 * 60 * 1000;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fixLabel = (f: Fix) => (f.type === 'faq' ? `${f.kind ? cap(f.kind) : 'Whole brand'} FAQ` : `vs ${f.competitor}`);
const hasConfirm = (s?: string) => !!s && s.includes('[confirm');

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--ink-2)',
  border: '1px solid var(--line)',
  color: 'var(--text)',
  padding: '8px 10px',
  borderRadius: '6px',
  fontSize: '13px',
  fontFamily: 'inherit',
};

const Fixes: React.FC = () => {
  const context = useOutletContext<OutletContextType>();
  const brandId = context?.currentBrand?._id;
  const [params] = useSearchParams();

  const [data, setData] = useState<FixesData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [type, setType] = useState<FixType>(params.get('type') === 'comparison' ? 'comparison' : 'faq');
  const [kind, setKind] = useState('');
  const [competitor, setCompetitor] = useState('');
  const [language, setLanguage] = useState<FixLanguage>('en');
  const [writing, setWriting] = useState(false);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [open, setOpen] = useState<Fix | null>(null);
  const [draft, setDraft] = useState<FixItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState('');
  const pollTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!brandId) return;
    try {
      const res = await api.get(`/brands/${brandId}/fixes`);
      const d: FixesData = res.data.data;
      setData(d);
      setCompetitor((c) => c || d.competitors[0] || '');
      setLoadError('');
    } catch {
      setLoadError("Couldn't load your fixes. Refresh the page to try again.");
    }
  }, [brandId]);

  useEffect(() => {
    load();
    return () => {
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
  }, [load]);

  const openFix = (f: Fix) => {
    setOpen(f);
    setDraft(f.items.map((i) => ({ ...i, rows: i.rows?.map((r) => ({ ...r })) })));
    setMessage(null);
  };

  const poll = (fixId: string, startedAt: number) => {
    pollTimer.current = window.setTimeout(async () => {
      try {
        const res = await api.get(`/brands/${brandId}/fixes/${fixId}`);
        const f: Fix = res.data.data;
        if (f.status === 'pending') {
          if (Date.now() - startedAt > POLL_GIVE_UP_MS) {
            setWriting(false);
            setMessage({ text: 'Still writing — check back in a minute.' });
            return;
          }
          return poll(fixId, startedAt);
        }
        setWriting(false);
        await load();
        if (f.status === 'done') openFix(f);
        else setMessage({ text: `${f.error || "Couldn't write this one, try again"} Not counted against your limit.`, bad: true });
      } catch {
        poll(fixId, startedAt);
      }
    }, POLL_MS);
  };

  const generate = async () => {
    if (!brandId) return;
    setMessage(null);
    setWriting(true);
    try {
      const res = await api.post(`/brands/${brandId}/fixes`, {
        type,
        language,
        ...(type === 'faq' ? { kind: kind || null } : { competitor }),
      });
      poll(res.data.data.fixId, Date.now());
    } catch (err: unknown) {
      setWriting(false);
      const text = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setMessage({ text: text || "Couldn't start. Try again in a minute.", bad: true });
    }
  };

  const save = async () => {
    if (!open || !brandId) return;
    setSaving(true);
    try {
      const res = await api.patch(`/brands/${brandId}/fixes/${open._id}`, { items: draft, title: open.title });
      const f: Fix = res.data.data;
      setOpen(f);
      setData((d) => (d ? { ...d, fixes: d.fixes.map((x) => (x._id === f._id ? f : x)) } : d));
      setMessage({ text: 'Saved.' });
    } catch {
      setMessage({ text: "Couldn't save. Try again.", bad: true });
    } finally {
      setSaving(false);
    }
  };

  const copy = (label: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(label);
    window.setTimeout(() => setCopied(''), 1500);
  };

  const editItem = (index: number, patch: Partial<FixItem>) =>
    setDraft((items) => items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  const editRow = (index: number, r: number, patch: Partial<{ label: string; brand: string; competitor: string }>) =>
    setDraft((items) =>
      items.map((it, i) => (i === index ? { ...it, rows: it.rows?.map((row, j) => (j === r ? { ...row, ...patch } : row)) } : it)),
    );

  if (!brandId) return <p style={{ color: 'var(--text-faint)' }}>Pick a brand first.</p>;
  if (loadError) return <p role="alert" style={{ color: 'var(--bad)' }}>{loadError}</p>;
  if (!data) return <p style={{ color: 'var(--text-dim)' }}>Loading fixes…</p>;

  const { usage } = data;
  // A fix opened for another brand isn't in this brand's list, so it closes when the brand changes
  const shown = open && data.fixes.some((f) => f._id === open._id) ? open : null;
  const used = usage.used >= usage.limit;
  const dirty = shown ? JSON.stringify(shown.items) !== JSON.stringify(draft) : false;
  const brandName = context.currentBrand.name;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Fixes for {brandName}</h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-faint)' }}>
            FAQ and comparison pages written from your own product pages, ready to paste into your store.
          </p>
        </div>
        <span className={`badge ${used ? 'badge-warn' : 'badge-ok'}`}>
          {usage.used}/{usage.limit} generations used this month · resets {usage.resetsOn}
        </span>
      </div>

      <div className="panel">
        <h3>Write a new one</h3>
        <p className="sub">We read your product pages, then write. Anything we can't find on them is marked [confirm] for you to fill in.</p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }} role="radiogroup" aria-label="What to write">
          {(['faq', 'comparison'] as FixType[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              className={`btn ${type === t ? 'btn-primary' : ''}`}
              onClick={() => setType(t)}
            >
              {t === 'faq' ? 'FAQ' : 'Comparison page'}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 16px' }}>
          {type === 'faq' ? (
            <div className="field">
              <label htmlFor="fix-kind">FAQ for</label>
              <select id="fix-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">Whole brand</option>
                {data.kinds.map((k) => (
                  <option key={k.kind} value={k.kind}>
                    {cap(k.kind)} ({k.count})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="fix-competitor">Compare with</label>
              <select id="fix-competitor" value={competitor} onChange={(e) => setCompetitor(e.target.value)}>
                {data.competitors.length === 0 && <option value="">Add a competitor in Settings first</option>}
                {data.competitors.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="fix-language">Language</label>
            <select id="fix-language" value={language} onChange={(e) => setLanguage(e.target.value as FixLanguage)}>
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {data.kinds.length === 0 && (
          <p style={{ fontSize: '12.5px', color: 'var(--text-dim)', margin: '0 0 12px' }}>
            Tip: <Link to="/settings">add products in Settings → Products</Link> for a better FAQ. Without them we read your homepage.
          </p>
        )}

        <button
          className="btn btn-primary"
          onClick={generate}
          disabled={writing || used || (type === 'comparison' && !competitor)}
        >
          {writing ? 'Writing… this takes about a minute' : 'Generate'}
        </button>
        {used && !writing && (
          <span style={{ marginLeft: '12px', fontSize: '12.5px', color: 'var(--text-dim)' }}>
            All {usage.limit} used this month. They reset on {usage.resetsOn}.{' '}
            <Link to="/billing">See plans</Link>
          </span>
        )}
        {message && (
          <p role={message.bad ? 'alert' : 'status'} style={{ margin: '12px 0 0', fontSize: '13px', color: message.bad ? 'var(--bad)' : 'var(--good)' }}>
            {message.text}
          </p>
        )}
      </div>

      {shown && shown.status === 'done' && (
        <div className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <h3>{shown.title || fixLabel(shown)}</h3>
              <p className="sub" style={{ marginBottom: '8px' }}>
                {fixLabel(shown)} · {LANGUAGES.find((l) => l.value === shown.language)?.label}
                {shown.note ? ` · ${shown.note}` : ''}
              </p>
            </div>
            <button className="btn" onClick={() => setOpen(null)} aria-label="Close">
              Close
            </button>
          </div>

          {draft.some((i) => hasConfirm(i.answer) || hasConfirm(i.body) || i.rows?.some((r) => hasConfirm(r.brand) || hasConfirm(r.competitor))) && (
            <p style={{ background: 'var(--amber-soft)', color: 'var(--amber)', padding: '8px 12px', borderRadius: '6px', fontSize: '12.5px' }}>
              Fill the highlighted [confirm] parts before publishing. The FAQ schema leaves those answers out until you do.
            </p>
          )}

          {draft.map((it, i) => (
            <div key={i} style={{ borderTop: '1px solid var(--line-soft)', padding: '12px 0' }}>
              {shown.type === 'faq' ? (
                <>
                  <input
                    aria-label={`Question ${i + 1}`}
                    style={{ ...inputStyle, fontWeight: 600, marginBottom: '6px' }}
                    value={it.question || ''}
                    onChange={(e) => editItem(i, { question: e.target.value })}
                  />
                  <textarea
                    aria-label={`Answer ${i + 1}`}
                    rows={3}
                    style={{ ...inputStyle, background: hasConfirm(it.answer) ? 'var(--amber-soft)' : inputStyle.background }}
                    value={it.answer || ''}
                    onChange={(e) => editItem(i, { answer: e.target.value })}
                  />
                </>
              ) : (
                <>
                  <input
                    aria-label={`Section ${i + 1} heading`}
                    style={{ ...inputStyle, fontWeight: 600, marginBottom: '6px' }}
                    value={it.heading || ''}
                    onChange={(e) => editItem(i, { heading: e.target.value })}
                  />
                  {it.rows ? (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', padding: '4px' }}></th>
                            <th style={{ textAlign: 'left', padding: '4px' }}>{brandName}</th>
                            <th style={{ textAlign: 'left', padding: '4px' }}>{shown.competitor}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {it.rows.map((r, j) => (
                            <tr key={j}>
                              {(['label', 'brand', 'competitor'] as const).map((col) => (
                                <td key={col} style={{ padding: '4px', minWidth: '120px' }}>
                                  <input
                                    aria-label={`Row ${j + 1} ${col}`}
                                    style={{ ...inputStyle, background: hasConfirm(r[col]) ? 'var(--amber-soft)' : inputStyle.background }}
                                    value={r[col]}
                                    onChange={(e) => editRow(i, j, { [col]: e.target.value })}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <textarea
                      aria-label={`Section ${i + 1} text`}
                      rows={4}
                      style={{ ...inputStyle, background: hasConfirm(it.body) ? 'var(--amber-soft)' : inputStyle.background }}
                      value={it.body || ''}
                      onChange={(e) => editItem(i, { body: e.target.value })}
                    />
                  )}
                </>
              )}
              {it.source && (
                <div style={{ fontSize: '11.5px', color: 'var(--text-faint)', marginTop: '4px', overflowWrap: 'anywhere' }}>
                  From{' '}
                  <a href={it.source} target="_blank" rel="noopener noreferrer">
                    {it.source}
                  </a>
                </div>
              )}
            </div>
          ))}

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
            <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {shown.outputs && (
              <>
                <button className="btn" onClick={() => copy('text', shown.outputs!.text)} disabled={dirty} title={dirty ? 'Save first' : undefined}>
                  {copied === 'text' ? 'Copied ✓' : 'Copy text'}
                </button>
                <button className="btn" onClick={() => copy('html', shown.outputs!.html)} disabled={dirty} title={dirty ? 'Save first' : undefined}>
                  {copied === 'html' ? 'Copied ✓' : 'Copy HTML'}
                </button>
                {shown.outputs.jsonLd && (
                  <button className="btn" onClick={() => copy('schema', shown.outputs!.jsonLd!)} disabled={dirty} title={dirty ? 'Save first' : undefined}>
                    {copied === 'schema' ? 'Copied ✓' : 'Copy FAQ schema'}
                  </button>
                )}
              </>
            )}
          </div>
          {dirty && <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '8px 0 0' }}>Save your changes to copy the updated version.</p>}
        </div>
      )}

      <div className="panel">
        <h3>Saved</h3>
        <p className="sub">Opening and copying these is free; only new ones count against your limit.</p>
        {data.fixes.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-faint)', margin: 0 }}>Nothing yet. Write your first FAQ above.</p>
        ) : (
          data.fixes.map((f) => (
            <button
              key={f._id}
              type="button"
              onClick={() => f.status === 'done' && openFix(f)}
              disabled={f.status !== 'done'}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                width: '100%',
                textAlign: 'left',
                background: shown?._id === f._id ? 'var(--amber-soft)' : 'transparent',
                border: 'none',
                borderTop: '1px solid var(--line-soft)',
                color: 'var(--text)',
                padding: '10px 4px',
                cursor: f.status === 'done' ? 'pointer' : 'default',
                fontSize: '13px',
              }}
            >
              <span>
                <strong>{f.title || fixLabel(f)}</strong>
                <span style={{ color: 'var(--text-faint)' }}> · {fixLabel(f)} · {LANGUAGES.find((l) => l.value === f.language)?.label}</span>
              </span>
              <span style={{ color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                {f.status === 'pending' ? 'Writing…' : new Date(f.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default Fixes;
