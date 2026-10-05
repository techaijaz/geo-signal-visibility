import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/axios';

interface BrandRow { name: string; answers: number; avgPosition: number | null; aheadOfYou: number; tracked: boolean }
interface Named { name: string; position: number | null }
interface LostTo {
  totalAnswers: number;
  extracted: boolean;
  you: { named: number; bestPosition: number | null; closestWin: { queryText: string; model: string; position: number } | null };
  brands: BrandRow[];
  byQuestion: Array<{ queryText: string; rows: Array<{ model: string; you: number | null; others: Named[] }> }>;
  topActions: Array<{ _id: string; text: string }>;
  trackedCompetitors: Array<{ name: string; website?: string }>;
}

function useLostTo(brandId?: string) {
  const [data, setData] = useState<LostTo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!brandId) return;
    try {
      const res = await api.get(`/brands/${brandId}/lost-to`);
      setData(res.data?.data ?? null);
    } catch {
      setData(null);
    }
  }, [brandId]);
  useEffect(() => { load(); }, [load]);

  const track = async (name: string) => {
    if (!brandId || !data) return;
    setError(null);
    try {
      await api.patch(`/brands/${brandId}`, { competitors: [...data.trackedCompetitors, { name }] });
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not add this competitor.');
    }
  };
  return { data, error, track };
}

const pos = (p: number | null) => (p ? `#${p}` : '—');

function BrandRows({ rows, total, track, full }: { rows: BrandRow[]; total: number; track: (n: string) => void; full?: boolean }) {
  return (
    <table>
      <thead>
        <tr><th>Brand</th><th>Answers</th><th>Avg position</th>{full && <th>Ahead of you</th>}<th></th></tr>
      </thead>
      <tbody>
        {rows.map((b) => (
          <tr key={b.name}>
            <td style={{ fontWeight: 600 }}>{b.name}</td>
            <td className="mono">{b.answers}/{total}</td>
            <td className="mono">{b.avgPosition ? `#${b.avgPosition}` : '—'}</td>
            {full && <td className="mono">{b.aheadOfYou}</td>}
            <td style={{ textAlign: 'right' }}>
              {b.tracked
                ? <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>tracked</span>
                : <button type="button" className="btn" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => track(b.name)}>Track</button>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Notes({ data, brandName }: { data: LostTo; brandName?: string }) {
  if (data.you.named === 0) {
    return (
      <div style={{ fontSize: '13.5px', margin: '4px 0 12px' }}>
        None of the {data.totalAnswers} answers named {brandName || 'your brand'}. That is common for newer brands: AI recommends brands it has read about in many places.
        {data.topActions.length > 0 && (
          <> Start with:
            <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
              {data.topActions.map((a) => <li key={a._id}><Link to="/recommendations">{a.text}</Link></li>)}
            </ul>
          </>
        )}
      </div>
    );
  }
  const w = data.you.closestWin;
  return w ? <p className="sub" style={{ margin: '4px 0 12px' }}>{w.model} named you #{w.position} for “{w.queryText}”.</p> : null;
}

export function LostToCard({ brandId, brandName }: { brandId?: string; brandName?: string }) {
  const { data, error, track } = useLostTo(brandId);
  if (!data || data.totalAnswers === 0) return null;
  return (
    <div className="panel">
      <h3>AI is recommending instead of you</h3>
      {!data.extracted || data.brands.length === 0 ? (
        <p className="sub">{data.extracted ? 'No other brands were named in the last scan.' : 'Brand names will appear after the next scan.'}</p>
      ) : (
        <>
          <Notes data={data} brandName={brandName} />
          {error && <p style={{ color: 'var(--bad)', fontSize: '13px' }}>{error}</p>}
          <div style={{ overflowX: 'auto' }}><BrandRows rows={data.brands.slice(0, 5)} total={data.totalAnswers} track={track} /></div>
          <div style={{ textAlign: 'right', marginTop: '10px', fontSize: '13px' }}><Link to="/competitors#lost-to">See every question →</Link></div>
        </>
      )}
    </div>
  );
}

export function LostToSection({ brandId, brandName }: { brandId?: string; brandName?: string }) {
  const { data, error, track } = useLostTo(brandId);
  if (!data || data.totalAnswers === 0) return null;
  return (
    <div className="panel" id="lost-to">
      <h3>Brands AI names instead of you</h3>
      {!data.extracted || data.brands.length === 0 ? (
        <p className="sub">{data.extracted ? 'No other brands were named in the last scan.' : 'Brand names will appear after the next scan.'}</p>
      ) : (
        <>
          <Notes data={data} brandName={brandName} />
          {error && <p style={{ color: 'var(--bad)', fontSize: '13px' }}>{error}</p>}
          <div style={{ overflowX: 'auto' }}><BrandRows rows={data.brands} total={data.totalAnswers} track={track} full /></div>
          <h3 style={{ marginTop: '24px' }}>By question</h3>
          {data.byQuestion.map((q) => (
            <div key={q.queryText} style={{ marginTop: '12px' }}>
              <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{q.queryText}</div>
              {q.rows.map((r) => (
                <div key={r.model} className="mono" style={{ fontSize: '12.5px', color: 'var(--text-dim)' }}>
                  {r.model}: You {pos(r.you)}{r.others.length ? ' · ' + r.others.map((o) => `${o.name} ${pos(o.position)}`).join(', ') : ''}
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
