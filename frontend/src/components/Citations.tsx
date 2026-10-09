import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/axios';

// Where AI reads (feature #9): the pages Gemini with Google Search cites for the brand's questions, and the
// pages that name competitors but not the brand. One engine's view, checked weekly.
type PageType = 'marketplace' | 'video' | 'own' | 'competitor' | 'article';
interface Row {
  url: string; domain: string; title: string; type: PageType; citedIn: string[]; brands: string[];
  readFrom: 'page' | 'answer'; isNew: boolean; tip: string;
}
interface Citations {
  locked?: boolean;
  run: { week: string; status: 'running' | 'ok' | 'failed'; checkedAt: string; questions: number } | null;
  failedLatest?: boolean;
  outreach: Row[];
  topSources: Array<{ domain: string; count: number }>;
  ownSite: { own: number; questions: number; topCompetitor: { name: string; count: number } | null };
  counts: { questions: number; failed: number; pages: number; read: number };
  newCount: number;
}

const PAGE = 20;
const TYPE_LABEL: Record<PageType, string> = { article: 'Article', video: 'Video', marketplace: 'Marketplace', own: 'Your site', competitor: 'Competitor site' };
const small = { fontSize: '13px', color: 'var(--text-faint)' } as const;
const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const label = (r: Row) => r.title || r.domain;

function useCitations(brandId?: string) {
  const [data, setData] = useState<Citations | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!brandId) return;
    let live = true;
    api.get(`/brands/${brandId}/citations`)
      .then((res) => { if (live) setData(res.data?.data ?? null); })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [brandId]);
  return { data, error };
}

export function CitationsSection({ brandId }: { brandId?: string }) {
  const { data, error } = useCitations(brandId);
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);

  const body = () => {
    if (error) return <p style={small}>Couldn't load where AI reads right now.</p>;
    if (!data) return null;
    if (data.locked) {
      return (
        <>
          <p className="sub">Upgrade to see which pages AI reads when buyers ask about your category, and which of them name your competitors but not you.</p>
          <Link className="btn btn-primary" to="/pricing">View Plans & Upgrade</Link>
        </>
      );
    }
    if (!data.run) return <p style={small}>The first check runs after your first scan, then every Sunday.</p>;
    if (data.run.status === 'running' && !data.counts.pages) return <p style={small}>Checking where AI reads…</p>;
    if (data.run.status === 'failed' && !data.failedLatest) return <p style={small}>This week's check failed. We'll try again next Sunday.</p>;
    const { ownSite } = data;
    return (
      <>
        <p style={small}>
          Gemini with Google Search · checked {day(data.run.checkedAt)} · {data.counts.questions} questions · {data.counts.pages} pages
          {data.counts.failed > 0 && ` · ${data.counts.failed} questions got no answer`}
        </p>
        {data.failedLatest && <p style={small}>This week's check failed; showing {day(data.run.checkedAt)}.</p>}
        <p style={{ ...small, marginTop: 0 }}>AI also reads other sources; this is one engine's view.</p>

        <h4 style={{ margin: '14px 0 4px' }}>Pages that name your competitors but not you{data.newCount > 0 && <span style={{ color: 'var(--good)', fontWeight: 400 }}> · {data.newCount} new</span>}</h4>
        {!data.outreach.length ? (
          <p style={small}>None this week: every cited page that names a competitor names you too.</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ minWidth: 560 }}>
                <thead><tr><th>Page</th><th>Type</th><th>Competitors</th><th>Cited in</th></tr></thead>
                <tbody>
                  {data.outreach.slice(0, shown).map((r) => (
                    <Fragment key={r.url}>
                      <tr onClick={() => setOpen(open === r.url ? null : r.url)} style={{ cursor: 'pointer' }}>
                        <td style={{ overflowWrap: 'anywhere' }}>
                          <a href={r.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{label(r)}</a>
                          {r.isNew && <span style={{ color: 'var(--good)', fontSize: '12px', fontWeight: 700 }}> NEW</span>}
                          <div style={small}>{r.domain}{r.readFrom === 'answer' && ' · from AI answer'}</div>
                        </td>
                        <td>{TYPE_LABEL[r.type]}</td>
                        <td>{r.brands.join(', ')}</td>
                        <td className="mono">{r.citedIn.length}</td>
                      </tr>
                      {open === r.url && (
                        <tr><td colSpan={4}>
                          <div style={{ fontSize: '13px' }}><strong>{r.tip}.</strong></div>
                          <div style={small}>Cited for: {r.citedIn.join(' · ')}</div>
                        </td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            {data.outreach.length > shown && (
              <button type="button" className="btn btn-ghost" style={{ marginTop: '8px' }} onClick={() => setShown(shown + PAGE)}>
                Show {Math.min(PAGE, data.outreach.length - shown)} more of {data.outreach.length - shown}
              </button>
            )}
          </>
        )}

        <h4 style={{ margin: '16px 0 4px' }}>Sites AI reads most</h4>
        <div style={{ fontSize: '13.5px' }}>
          {data.topSources.map((s) => <div key={s.domain} className="mono">{s.domain} · {s.count}</div>)}
        </div>
        <p style={{ fontSize: '13.5px', marginTop: '10px' }}>
          Your site was cited in {ownSite.own} of {ownSite.questions} answers
          {ownSite.topCompetitor && `; ${ownSite.topCompetitor.name}'s site: ${ownSite.topCompetitor.count}`}.
          {ownSite.own === 0 && ownSite.topCompetitor && (
            <> AI reads competitors' product pages — <Link to="/audit">improve yours</Link>.</>
          )}
        </p>
      </>
    );
  };

  return (
    <div className="panel">
      <h3>Where AI reads</h3>
      {body()}
    </div>
  );
}

export function CitationsCard({ brandId }: { brandId?: string }) {
  const { data } = useCitations(brandId);
  if (!data || data.locked || !data.outreach?.length) return null;
  return (
    <div className="panel">
      <h3>Top outreach targets</h3>
      {data.outreach.slice(0, 3).map((r) => (
        <div key={r.url} style={{ fontSize: '13.5px', margin: '4px 0', overflowWrap: 'anywhere' }}>
          <a href={r.url} target="_blank" rel="noopener noreferrer">{label(r)}</a> <span style={small}>· names {r.brands.join(', ')}</span>
        </div>
      ))}
      <div style={{ textAlign: 'right', marginTop: '10px', fontSize: '13px' }}><Link to="/competitors">See all →</Link></div>
    </div>
  );
}
