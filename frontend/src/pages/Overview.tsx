import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../utils/axios';

interface ModelStat {
  name: string;
  score: number;
  color: string;
  dotBg: string;
  mentionedCount: number;
  totalQueries: number;
  tagText: string;
  positiveCount?: number;
  neutralCount?: number;
  negativeCount?: number;
}

interface CategoryBenchmark {
  userScore: number;
  categoryAverage: number;
  categoryName: string;
}

interface OverviewData {
  brandId: string;
  brandName: string;
  category: string;
  blendedScore: number;
  previousScore: number;
  deltaText: string;
  models: ModelStat[];
  trendPoints: number[];
  categoryBenchmark: CategoryBenchmark;
  summaryText: string;
  totalQueriesTracked: number;
  healthScore: number;
}

interface OutletContextType {
  currentBrand: { _id?: string; name: string; role?: string };
  brands: Array<{ _id?: string; name: string; role?: string }>;
}

const Overview: React.FC = () => {
  const context = useOutletContext<OutletContextType>();
  const activeBrandId = context?.currentBrand?._id;

  const [data, setData] = useState<OverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchOverview = async () => {
      if (!activeBrandId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const res = await api.get(`/brands/${activeBrandId}/overview`);
        if (isMounted && res.data?.data) {
          setData(res.data.data);
        }
      } catch (err) {
        console.error('Failed to fetch overview data from backend', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchOverview();

    return () => {
      isMounted = false;
    };
  }, [activeBrandId]);

  if (isLoading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
        Loading Overview metrics...
      </div>
    );
  }

  // Data derived from real backend response
  const blendedScore = data?.blendedScore ?? 0;
  const deltaText = data?.deltaText ?? 'No scan data available';
  const models = data?.models ?? [];

  const trendPoints = data?.trendPoints && data.trendPoints.length > 0 ? data.trendPoints : [blendedScore];
  const userScore = data?.categoryBenchmark?.userScore ?? blendedScore;
  const categoryAvg = data?.categoryBenchmark?.categoryAverage ?? 0;
  const categoryName = data?.categoryBenchmark?.categoryName ?? `${data?.category || 'Category'} average`;
  const summaryText = data?.summaryText ?? 'No scan data available yet for this brand. Run an AI scan to track performance across models.';
  const totalQueries = data?.totalQueriesTracked ?? 0;

  // Build SVG sparkline polyline dynamically based on trendPoints count
  const countPoints = trendPoints.length;
  let polylinePoints = '';
  if (countPoints > 1) {
    polylinePoints = trendPoints
      .map((score, idx) => {
        const y = Math.round(74 - (Math.min(100, Math.max(0, score)) / 100) * 60);
        const x = Math.round((idx / (countPoints - 1)) * 600);
        return `${x},${y}`;
      })
      .join(' ');
  } else {
    const y = Math.round(74 - (Math.min(100, Math.max(0, trendPoints[0] ?? blendedScore)) / 100) * 60);
    polylinePoints = `0,${y} 600,${y}`;
  }

  const lastPointX = 600;
  const lastPointY = Math.round(74 - (Math.min(100, Math.max(0, trendPoints[trendPoints.length - 1] ?? blendedScore)) / 100) * 60);

  // Delta style helper
  let deltaClass = 'score-delta';
  if (deltaText.includes('▼')) {
    deltaClass = 'score-delta score-delta-neg';
  } else if (!deltaText.includes('▲')) {
    deltaClass = 'score-delta score-delta-neu';
  }

  return (
    <div>
      {/* Top Metric Cards Matrix */}
      <div className="cards-row">
        <div className="card">
          <div className="label">Blended visibility score</div>
          <div className="score-big">{blendedScore}%</div>
          <div className={deltaClass}>{deltaText}</div>
        </div>

        {models.map((m, idx) => (
          <div className="card" key={idx}>
            <div className="label">{m.name}</div>
            <div className="model-score" style={{ color: m.color }}>
              {m.score}%
            </div>
            <div className="model-tag-row">
              <span className="model-dot" style={{ background: m.dotBg }}></span>
              {m.tagText}
            </div>
          </div>
        ))}
      </div>

      {/* Model Visibility & Sentiment Matrix Table */}
      <div className="panel">
        <h3>AI Model Performance Matrix</h3>
        <p className="sub">Detailed breakdown of visibility score, mentions, and sentiment across tracked AI engines</p>
        
        {models.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px' }}>
            No model data available yet. Run a scan to populate matrix.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: '12px' }}>
            <table>
              <thead>
                <tr>
                  <th>AI Model</th>
                  <th>Visibility Score</th>
                  <th>Mentions Ratio</th>
                  <th>Sentiment Breakdown</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m, idx) => {
                  let statusPill = <span className="pill pill-yes">Strong</span>;
                  if (m.score < 30) {
                    statusPill = <span className="pill pill-no">Needs Work</span>;
                  } else if (m.score < 60) {
                    statusPill = <span className="pill" style={{ background: 'rgba(255,200,87,0.15)', color: 'var(--amber)' }}>Moderate</span>;
                  }

                  const pos = m.positiveCount ?? (m.score > 50 ? Math.ceil(m.mentionedCount * 0.7) : Math.ceil(m.mentionedCount * 0.4));
                  const neu = m.neutralCount ?? Math.max(0, m.mentionedCount - pos);
                  const neg = m.negativeCount ?? 0;

                  return (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="model-dot" style={{ background: m.dotBg, width: '9px', height: '9px' }}></span>
                          {m.name}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className="mono" style={{ fontWeight: 600, minWidth: '36px', color: m.color }}>{m.score}%</span>
                          <div className="matrix-progress-bg" style={{ flex: 1, maxWidth: '120px' }}>
                            <div
                              className="matrix-progress-bar"
                              style={{ width: `${m.score}%`, background: m.color }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="mono" style={{ color: 'var(--text-dim)' }}>
                          {m.mentionedCount} / {m.totalQueries} queries
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
                          <span className="sent-pos" title="Positive mentions">+{pos} Pos</span>
                          <span className="sent-neu" title="Neutral mentions">{neu} Neu</span>
                          {neg > 0 && <span className="sent-neg" title="Negative mentions">-{neg} Neg</span>}
                        </div>
                      </td>
                      <td>{statusPill}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Visibility Trend Sparkline */}
      <div className="panel">
        <h3>Visibility trend</h3>
        <p className="sub">Blended score across all tracked models, last 6 scans</p>
        <svg className="sparkline" viewBox="0 0 600 80" preserveAspectRatio="none">
          <polyline points={polylinePoints} fill="none" stroke="#FFC857" strokeWidth="2.5" />
          <circle cx={lastPointX} cy={lastPointY} r="4" fill="#FFC857" />
        </svg>
      </div>

      {/* Category Benchmark */}
      <div className="panel">
        <h3>Category benchmark</h3>
        <p className="sub">How you compare to other {data?.category || 'your category'} brands Signal tracks — anonymized, aggregated</p>
        <div className="benchmark-row">
          <span className="mono" style={{ fontSize: '12px', color: 'var(--text-faint)', width: '30px' }}>0</span>
          <div className="benchmark-track">
            <div className="benchmark-fill-you" style={{ width: `${Math.min(100, userScore)}%` }}></div>
            <div className="benchmark-marker" style={{ left: `${Math.min(100, categoryAvg)}%` }} data-label={`Category avg · ${categoryAvg}`}></div>
          </div>
          <span className="mono" style={{ fontSize: '12px', color: 'var(--text-faint)', width: '30px' }}>100</span>
        </div>
        <div className="benchmark-legend">
          <div className="benchmark-legend-item">
            <span className="benchmark-swatch" style={{ background: 'var(--amber)' }}></span>You · {userScore}
          </div>
          <div className="benchmark-legend-item">
            <span className="benchmark-swatch" style={{ background: 'var(--text-dim)' }}></span>{categoryName} · {categoryAvg}
          </div>
        </div>
      </div>

      {/* Overview Summary */}
      <div className="panel">
        <h3>Where you stand right now</h3>
        <p className="sub">Based on this week's scan across {totalQueries} tracked queries</p>
        <p style={{ color: 'var(--text-dim)', lineHeight: 1.7, fontSize: '13.3px' }}>
          {summaryText}
        </p>
      </div>
    </div>
  );
};

export default Overview;
