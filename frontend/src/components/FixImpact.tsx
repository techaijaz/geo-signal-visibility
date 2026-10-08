import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/axios';

// Visibility before and after the work a brand did (feature #14). Always "after", never "because of".
type State = 'no-before' | 'measuring' | 'interim' | 'final' | 'no-after';
interface FixGroup {
  start: string; end: string;
  fixes: Array<{ text: string; category: string; verified: boolean; doneAt: string }>;
  verified: boolean; state: State; daysLeft?: number;
  before?: number; after?: number; delta?: number; result?: 'up' | 'flat' | 'down';
  engines?: Array<{ name: string; before: number; after: number }>;
}
interface FixImpact { groups: FixGroup[]; overview: FixGroup | null; measuringCount: number; measuringDays: number | null }

const day = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const span = (g: FixGroup) => {
  const a = new Date(g.start), b = new Date(g.end);
  if (a.toDateString() === b.toDateString()) return day(g.start);
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${day(g.end)}` : `${day(g.start)} – ${day(g.end)}`;
};
const names = (g: FixGroup) => (g.fixes.length === 1 ? g.fixes[0].text : `${g.fixes[0].text} + ${g.fixes.length - 1} more`);
const small = { fontSize: '13px', color: 'var(--text-faint)' } as const;

function useFixImpact(brandId?: string) {
  const [data, setData] = useState<FixImpact | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!brandId) return;
    let live = true;
    api.get(`/brands/${brandId}/fix-impact`)
      .then((res) => { if (live) setData(res.data?.data ?? null); })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [brandId]);
  return { data, error };
}

function Numbers({ g }: { g: FixGroup }) {
  const so = g.state === 'interim' ? ' so far' : '';
  if (g.result === 'up') return <span style={{ color: 'var(--good)', fontWeight: 700 }}>Visibility {g.before}% → {g.after}% ↑ +{g.delta}{so}</span>;
  if (g.result === 'flat') return <span style={small}>Visibility {g.before}% → {g.after}%{so}. No big change yet. AI takes time to pick up new content.</span>;
  return (
    <span style={small}>
      Visibility {g.before}% → {g.after}%{so}. This is unlikely to come from the fix; <Link to="/competitors">see which brands moved ahead</Link>.
    </span>
  );
}

function StateLine({ g }: { g: FixGroup }) {
  if (g.state === 'no-before') return <span style={small}>No scan before this work, so there is nothing to compare with.</span>;
  if (g.state === 'no-after') return <span style={small}>Not enough scans after this work to measure it.</span>;
  if (g.state === 'measuring') return <span style={small}>Measuring the effect, about {g.daysLeft} day{g.daysLeft === 1 ? '' : 's'} to go.</span>;
  return <Numbers g={g} />;
}

export function FixImpactSection({ brandId }: { brandId?: string }) {
  const { data, error } = useFixImpact(brandId);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="panel">
      <h3>Your work and its effect</h3>
      <p className="sub">AI visibility in the 2 weeks before your work and 1–4 weeks after it. Visibility also moves with AI updates and competitors.</p>
      {error && <p style={small}>Couldn't load the effect of your work right now.</p>}
      {data && !data.groups.length && <p style={small}>Mark recommendations done as you ship them; we'll show how your AI visibility moved after each one.</p>}
      {data?.groups.map((g, i) => (
        <div key={g.start} style={{ borderTop: '1px solid var(--line)', padding: '10px 0', cursor: g.engines ? 'pointer' : 'default' }}
          onClick={() => g.engines && setOpen(open === i ? null : i)}>
          <div style={{ fontSize: '13.5px', fontWeight: 600 }}>
            {span(g)} · {g.fixes.length} fix{g.fixes.length === 1 ? '' : 'es'}
            {g.verified && <span style={{ color: 'var(--good)', fontWeight: 400 }}> ✓ verified</span>}
          </div>
          <div style={{ ...small, margin: '2px 0 4px', overflowWrap: 'anywhere' }}>{g.fixes.map((f) => f.text).join(' · ')}</div>
          <div style={{ fontSize: '13.5px' }}><StateLine g={g} /></div>
          {open === i && g.engines && (
            <div style={{ marginTop: '6px', fontSize: '13px' }}>
              {g.engines.map((e) => <div key={e.name} className="mono">{e.name}: {e.before}% → {e.after}%</div>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function FixImpactCard({ brandId }: { brandId?: string }) {
  const { data } = useFixImpact(brandId);
  if (!data || (!data.overview && !data.measuringCount)) return null;
  const g = data.overview;
  return (
    <div className="panel">
      <h3>Your work and its effect</h3>
      {g ? (
        <div style={{ fontSize: '13.5px' }}>{names(g)} → <Numbers g={g} /></div>
      ) : (
        <p className="sub" style={{ margin: 0 }}>
          Measuring the effect of {data.measuringCount} fix{data.measuringCount === 1 ? '' : 'es'}, result in about {data.measuringDays} day{data.measuringDays === 1 ? '' : 's'}.
        </p>
      )}
      <div style={{ textAlign: 'right', marginTop: '10px', fontSize: '13px' }}><Link to="/recommendations">See all →</Link></div>
    </div>
  );
}
