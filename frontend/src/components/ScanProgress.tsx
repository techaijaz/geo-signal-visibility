import { useEffect, useState } from 'react';

const ENGINES = [
  { label: 'CLAUDE', color: 'var(--claude)' },
  { label: 'GPT', color: 'var(--gpt)' },
  { label: 'GEMINI', color: 'var(--gemini)' },
];

// The login page's scanner, shown while a scan or other slow AI job runs
export default function ScanProgress({ title, hint }: { title: string; hint: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div className="scanner" role="status" aria-live="polite" style={{ marginBottom: '16px' }}>
      <div className="scanner-row">
        <span className="scanner-label">{title}</span>
        <span className="scanner-label mono">{elapsed}</span>
      </div>
      <div className="scanner-track">
        <div className="scanner-grid"></div>
        <div className="scanner-sweep"></div>
        <div className="scanner-ticks">
          {ENGINES.map((e) => (
            <div className="scanner-tick" key={e.label}>
              <span className="tick-dot" style={{ background: e.color, color: e.color }}></span>
              <span className="tick-label">{e.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="scanner-label" style={{ marginTop: '12px', textTransform: 'none', letterSpacing: 0, fontSize: '12.5px' }}>{hint}</div>
    </div>
  );
}
