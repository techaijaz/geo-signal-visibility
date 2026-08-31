import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import api from '../utils/axios';
import { usePlanLimits } from '../hooks/usePlanLimits';

interface RecommendationItem {
  _id: string;
  text: string;
  category: 'Technical' | 'Content' | 'Off-site';
  effort: 'Low effort' | 'Medium effort' | 'High effort';
  impact: 'High impact' | 'Medium impact' | 'Low impact';
  reasoning?: string;
  snippet?: string;
  isCompleted: boolean;
}

interface OutletContextType {
  currentBrand: { _id?: string; name: string; role?: string };
  brands: Array<{ _id?: string; name: string; role?: string }>;
}

type CategoryFilter = 'All' | 'Technical' | 'Content' | 'Off-site';
type StatusFilter = 'All' | 'Pending' | 'Completed';

const Recommendations: React.FC = () => {
  const context = useOutletContext<OutletContextType>();
  const navigate = useNavigate();
  const activeBrandId = context?.currentBrand?._id;
  const { limits, plan, loading: planLoading } = usePlanLimits();

  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRescanning, setIsRescanning] = useState(false);
  const [openSnippets, setOpenSnippets] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter states
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('All');
  const [activeStatus, setActiveStatus] = useState<StatusFilter>('All');

  useEffect(() => {
    let isMounted = true;

    const fetchRecommendations = async () => {
      if (!activeBrandId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const res = await api.get(`/brands/${activeBrandId}/recommendations`);
        if (isMounted && res.data?.data?.recommendations) {
          setRecommendations(res.data.data.recommendations);
        }
      } catch (err) {
        console.error('Failed to fetch recommendations from backend', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchRecommendations();

    return () => {
      isMounted = false;
    };
  }, [activeBrandId]);

  const toggleCheck = async (recId: string, currentStatus: boolean) => {
    const targetStatus = !currentStatus;

    // Optimistic UI update
    setRecommendations((prev) =>
      prev.map((item) => (item._id === recId ? { ...item, isCompleted: targetStatus } : item))
    );

    try {
      if (activeBrandId) {
        await api.patch(`/brands/${activeBrandId}/recommendations/${recId}/toggle`, {
          isCompleted: targetStatus,
        });
      }
    } catch (err) {
      console.error('Failed to update recommendation status', err);
      // Revert status on failure
      setRecommendations((prev) =>
        prev.map((item) => (item._id === recId ? { ...item, isCompleted: currentStatus } : item))
      );
    }
  };

  const handleRescan = async () => {
    if (!activeBrandId || isRescanning) return;
    setIsRescanning(true);

    try {
      const res = await api.post(`/brands/${activeBrandId}/recommendations/rescan`);
      if (res.data?.data?.status === 'queued') {
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          try {
            const pollRes = await api.get(`/brands/${activeBrandId}/recommendations`);
            if (pollRes.data?.data?.recommendations) {
              setRecommendations(pollRes.data.data.recommendations);
            }
          } catch (e) {
            console.error('Polling recommendations error:', e);
          }
          if (attempts >= 6) {
            clearInterval(interval);
            setIsRescanning(false);
          }
        }, 3000);
      } else if (res.data?.data?.recommendations) {
        setRecommendations(res.data.data.recommendations);
        setIsRescanning(false);
      }
    } catch (err) {
      console.error('Failed to rescan recommendations', err);
      setIsRescanning(false);
    }
  };

  const toggleSnippet = (id: string) => {
    setOpenSnippets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copySnippet = (id: string, text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 1500);
  };

  // Metrics calculation
  const totalCount = recommendations.length;
  const completedCount = recommendations.filter((r) => r.isCompleted).length;
  const pendingCount = totalCount - completedCount;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const highImpactPending = recommendations.filter((r) => !r.isCompleted && r.impact === 'High impact').length;

  const categoryCounts = useMemo(() => {
    return {
      All: totalCount,
      Technical: recommendations.filter((r) => r.category === 'Technical').length,
      Content: recommendations.filter((r) => r.category === 'Content').length,
      'Off-site': recommendations.filter((r) => r.category === 'Off-site').length,
    };
  }, [recommendations, totalCount]);

  const statusCounts = useMemo(() => {
    return {
      All: totalCount,
      Pending: pendingCount,
      Completed: completedCount,
    };
  }, [totalCount, pendingCount, completedCount]);

  const filteredRecommendations = useMemo(() => {
    return recommendations.filter((item) => {
      const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
      const matchesStatus =
        activeStatus === 'All' ||
        (activeStatus === 'Pending' && !item.isCompleted) ||
        (activeStatus === 'Completed' && item.isCompleted);
      return matchesCategory && matchesStatus;
    });
  }, [recommendations, activeCategory, activeStatus]);

  const getCategoryClass = (cat: string) => {
    switch (cat) {
      case 'Technical':
        return 'rec-cat-technical';
      case 'Content':
        return 'rec-cat-content';
      case 'Off-site':
        return 'rec-cat-off-site';
      default:
        return '';
    }
  };

  const getImpactClass = (impact: string) => {
    return impact === 'High impact' ? 'rec-impact-high' : 'rec-impact-medium';
  };

  if (planLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-dim)' }}>
        <p>Loading plan details...</p>
      </div>
    );
  }

  if (limits && !limits.features.recommendations) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: '60px 40px' }}>
        <h3 style={{ color: 'var(--amber)', marginBottom: '16px' }}>🔒 Recommendations are not available on the {plan.toUpperCase()} plan</h3>
        <p className="sub" style={{ marginBottom: '24px' }}>
          Upgrade to Starter or higher to get AI-powered recommendations on improving your brand visibility.
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/pricing')}>
          View Plans & Upgrade
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-dim)' }}>
        <span className="rescan-icon spinning" style={{ fontSize: '24px', display: 'inline-block', marginBottom: '10px' }}>
          ⚙
        </span>
        <p>Loading AI optimization recommendations...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header bar with title & Rescan button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
            Recommendations for {context?.currentBrand?.name || 'Brand'}
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-faint)' }}>
            Actionable optimization tasks tailored for search crawlers & AI engine visibility.
          </p>
        </div>
        <button
          onClick={handleRescan}
          disabled={isRescanning}
          style={{
            background: 'var(--panel-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '8px 16px',
            color: 'var(--text-main)',
            fontSize: '13px',
            fontWeight: 500,
            cursor: isRescanning ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          <span className={`rescan-icon ${isRescanning ? 'spinning' : ''}`} style={{ fontSize: '14px', display: 'inline-block' }}>
            ⚙
          </span>
          {isRescanning ? 'Generating with AI...' : 'Re-scan Recommendations'}
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="rec-stats-grid">
        <div className="rec-stat-card">
          <span className="rec-stat-label">Completion Rate</span>
          <span className="rec-stat-val" style={{ color: progressPercent === 100 ? 'var(--good)' : 'var(--amber)' }}>
            {progressPercent}%
          </span>
        </div>
        <div className="rec-stat-card">
          <span className="rec-stat-label">High-Impact Pending</span>
          <span className="rec-stat-val" style={{ color: highImpactPending > 0 ? 'var(--amber)' : 'var(--good)' }}>
            {highImpactPending}
          </span>
        </div>
        <div className="rec-stat-card">
          <span className="rec-stat-label">Completed Tasks</span>
          <span className="rec-stat-val">
            {completedCount} <span style={{ fontSize: '13px', color: 'var(--text-faint)', fontWeight: 400 }}>/ {totalCount}</span>
          </span>
        </div>
      </div>

      <div className="panel">
        <h3>Prioritized action list</h3>
        <p className="sub">
          Generated from latest audit and mention data. Mark items done as you ship them — we'll re-score on next scan.
        </p>

        {/* Progress Bar */}
        <div className="rec-progress">
          <div className="rec-progress-bar">
            <div className="rec-progress-fill" style={{ width: `${progressPercent}%` }}></div>
          </div>
          <span className="mono" style={{ fontSize: '12.5px', color: 'var(--text-dim)' }}>
            {completedCount} / {totalCount} done
          </span>
        </div>

        {/* Filter Controls Bar */}
        <div className="rec-filter-bar">
          {/* Category Filter Pills */}
          <div className="rec-filter-group">
            {(['All', 'Technical', 'Content', 'Off-site'] as CategoryFilter[]).map((cat) => (
              <button
                key={cat}
                className={`rec-filter-pill ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat === 'All' ? 'All Categories' : cat}
                <span className="rec-filter-count">{categoryCounts[cat]}</span>
              </button>
            ))}
          </div>

          {/* Status Filter Pills */}
          <div className="rec-filter-group">
            {(['All', 'Pending', 'Completed'] as StatusFilter[]).map((status) => (
              <button
                key={status}
                className={`rec-filter-pill ${activeStatus === status ? 'active' : ''}`}
                onClick={() => setActiveStatus(status)}
              >
                {status}
                <span className="rec-filter-count">{statusCounts[status]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Completion Celebration Callout */}
        {totalCount > 0 && completedCount === totalCount && (
          <div
            style={{
              padding: '16px 20px',
              background: 'rgba(74, 222, 128, 0.1)',
              border: '1px solid rgba(74, 222, 128, 0.3)',
              borderRadius: '8px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              color: 'var(--good)',
            }}
          >
            <span style={{ fontSize: '20px' }}>🎉</span>
            <div>
              <strong style={{ fontSize: '14px', display: 'block' }}>All recommendations completed!</strong>
              <span style={{ fontSize: '12.5px', color: 'var(--text-dim)' }}>
                Great work! Run a new scan in AI Mentions or Website Audit to measure your updated AI visibility score.
              </span>
            </div>
          </div>
        )}

        {/* Recommendation Cards List */}
        {filteredRecommendations.length > 0 ? (
          filteredRecommendations.map((rec) => {
            const isDone = rec.isCompleted;
            const isSnippetOpen = !!openSnippets[rec._id];

            return (
              <div key={rec._id} className={`rec-card ${isDone ? 'done' : ''}`} data-rec>
                <input
                  type="checkbox"
                  className="rec-check"
                  checked={isDone}
                  onChange={() => toggleCheck(rec._id, rec.isCompleted)}
                  title={isDone ? 'Mark as pending' : 'Mark as completed'}
                />
                <div className="rec-body">
                  <div className="rec-text">{rec.text}</div>

                  {rec.reasoning && (
                    <div className="rec-reasoning">
                      💡 <strong>Why this matters:</strong> {rec.reasoning}
                    </div>
                  )}

                  <div className="rec-tags">
                    <span className={`rec-tag ${getCategoryClass(rec.category)}`}>{rec.category}</span>
                    <span className="rec-tag rec-effort">{rec.effort}</span>
                    <span className={`rec-tag ${getImpactClass(rec.impact)}`}>{rec.impact}</span>
                  </div>

                  {rec.snippet && (
                    <>
                      <div className="rec-actions">
                        <button
                          className="btn rec-snippet-toggle"
                          onClick={() => toggleSnippet(rec._id)}
                        >
                          {isSnippetOpen ? 'Hide fix' : 'Generate fix'}
                        </button>
                      </div>

                      <div className={`snippet-box ${isSnippetOpen ? 'open' : ''}`}>
                        <button
                          className="btn snippet-copy-btn"
                          onClick={() => copySnippet(rec._id, rec.snippet!)}
                        >
                          {copiedId === rec._id ? 'Copied ✓' : 'Copy'}
                        </button>
                        <pre>{rec.snippet}</pre>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-faint)', fontSize: '13.5px' }}>
            {totalCount > 0 ? (
              <div>
                <p>No recommendations match your selected filters ({activeCategory} / {activeStatus}).</p>
                <button
                  className="btn"
                  style={{ marginTop: '10px', fontSize: '12.5px' }}
                  onClick={() => {
                    setActiveCategory('All');
                    setActiveStatus('All');
                  }}
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div>
                No recommendations generated yet for {context?.currentBrand?.name || 'this brand'}. Click "Re-scan Recommendations" above to generate action tasks.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Recommendations;
