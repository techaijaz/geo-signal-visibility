import React, { useEffect, useRef, useState } from 'react';

export interface VisibilityTrendPoint {
  scanId: string;
  scannedAt: string;
  score: number;
  models: Array<{ name: string; score: number }>;
}

interface Props {
  points: VisibilityTrendPoint[];
}

const HEIGHT = 190;
const M = { top: 14, right: 48, bottom: 26, left: 36 };
const Y_TICKS = [0, 25, 50, 75, 100];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// Fit as many x-labels as the width allows (~72px each), always including first and last scan
const xLabelIndexes = (count: number, plotWidth: number) => {
  const max = Math.max(2, Math.min(6, Math.floor(plotWidth / 72)));
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const step = (count - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => Math.round(i * step));
};

const VisibilityTrendChart: React.FC<Props> = ({ points }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [points.length >= 2]);

  if (points.length < 2) {
    return (
      <div className="trend-empty">
        {points.length === 1
          ? `First scan recorded (${points[0].score}% on ${formatDate(points[0].scannedAt)}). The trend line appears after your next scan.`
          : 'No scan history yet. The trend line appears once your brand has been scanned at least twice.'}
      </div>
    );
  }

  const plotW = width - M.left - M.right;
  const plotH = HEIGHT - M.top - M.bottom;
  const x = (i: number) => M.left + (i / (points.length - 1)) * plotW;
  const y = (v: number) => M.top + (1 - Math.min(100, Math.max(0, v)) / 100) * plotH;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.score)}`).join(' ');
  const areaPath = `${linePath} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const last = points[points.length - 1];
  const lastIdx = points.length - 1;

  const indexFromPointer = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const rel = (clientX - rect.left - M.left) / plotW;
    return Math.min(lastIdx, Math.max(0, Math.round(rel * lastIdx)));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const cur = active ?? lastIdx;
      setActive(Math.min(lastIdx, Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1))));
    } else if (e.key === 'Escape') {
      setActive(null);
    }
  };

  const hovered = active !== null ? points[active] : null;
  const prev = active !== null && active > 0 ? points[active - 1] : null;
  // Tooltip sits beside the crosshair (flipping sides past the midpoint) so it never covers the line there
  const tooltipOnLeft = active !== null && x(active) > width / 2;
  const tooltipLeft = active !== null ? x(active) + (tooltipOnLeft ? -12 : 12) : 0;

  return (
    <div>
      <div
        ref={wrapRef}
        className="trend-chart"
        onPointerMove={(e) => setActive(indexFromPointer(e.clientX))}
        onPointerLeave={() => setActive(null)}
      >
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Visibility trend over ${points.length} scans, from ${points[0].score}% to ${last.score}%. Use arrow keys to inspect each scan.`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onFocus={() => setActive(lastIdx)}
          onBlur={() => setActive(null)}
        >
          {Y_TICKS.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className="trend-grid" />
              <text x={M.left - 8} y={y(t)} className="trend-axis" textAnchor="end" dominantBaseline="middle">
                {t}
              </text>
            </g>
          ))}

          {xLabelIndexes(points.length, plotW).map((i) => (
            <text
              key={points[i].scanId}
              x={x(i)}
              y={HEIGHT - 6}
              className="trend-axis"
              textAnchor={i === 0 ? 'start' : i === lastIdx ? 'end' : 'middle'}
            >
              {formatDate(points[i].scannedAt)}
            </text>
          ))}

          <path d={areaPath} className="trend-area" />
          <path d={linePath} className="trend-line" />

          {active !== null && (
            <>
              <line x1={x(active)} x2={x(active)} y1={M.top} y2={y(0)} className="trend-crosshair" />
              <circle cx={x(active)} cy={y(points[active].score)} r={5} className="trend-dot" />
            </>
          )}

          <circle cx={x(lastIdx)} cy={y(last.score)} r={4} className="trend-dot" />
          <text x={x(lastIdx) + 10} y={y(last.score)} className="trend-end-label" dominantBaseline="middle">
            {last.score}%
          </text>
        </svg>

        {hovered && (
          <div className="trend-tooltip" style={{ left: tooltipLeft, transform: tooltipOnLeft ? 'translateX(-100%)' : 'none' }}>
            <div className="trend-tooltip-date">{formatDateTime(hovered.scannedAt)}</div>
            <div className="trend-tooltip-value">
              {hovered.score}%
              {prev && (
                <span className={hovered.score >= prev.score ? 'trend-up' : 'trend-down'}>
                  {hovered.score >= prev.score ? '▲' : '▼'} {Math.abs(hovered.score - prev.score)} pts
                </span>
              )}
            </div>
            <div className="trend-tooltip-label">Blended visibility</div>
            {hovered.models.map((m) => (
              <div className="trend-tooltip-row" key={m.name}>
                <span>{m.name}</span>
                <span className="mono">{m.score}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button type="button" className="trend-table-toggle" onClick={() => setShowTable((v) => !v)}>
        {showTable ? 'Hide table' : 'View as table'}
      </button>
      {showTable && (
        <table className="trend-table">
          <thead>
            <tr>
              <th>Scan</th>
              <th>Blended</th>
              {points[lastIdx].models.map((m) => (
                <th key={m.name}>{m.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.scanId}>
                <td>{formatDateTime(p.scannedAt)}</td>
                <td className="mono">{p.score}%</td>
                {points[lastIdx].models.map((m) => {
                  const match = p.models.find((pm) => pm.name === m.name);
                  return (
                    <td key={m.name} className="mono">
                      {match ? `${match.score}%` : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default VisibilityTrendChart;
