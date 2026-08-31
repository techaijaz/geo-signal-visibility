import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../utils/axios';

interface MentionItem {
  _id: string;
  queryText: string;
  model: string;
  mentioned: boolean;
  position: number | null;
  sentiment: 'Positive' | 'Neutral' | 'Negative';
  extractedAt: string;
}

interface OutletContextType {
  currentBrand: { _id?: string; name: string; role: string };
  brands: Array<{ _id?: string; name: string; role?: string }>;
  setCurrentBrand: (brand: { _id?: string; name: string; role: string }) => void;
}

const DEFAULT_MODEL_FILTERS = ['All models'];

const PROTOTYPE_MENTIONS: MentionItem[] = [];

export default function Mentions() {
  const context = useOutletContext<OutletContextType>();
  const activeBrandId = context?.currentBrand?._id;

  const [modelFilters, setModelFilters] = useState<string[]>(DEFAULT_MODEL_FILTERS);
  const [activeModel, setActiveModel] = useState('All models');
  const [mentions, setMentions] = useState<MentionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  // Fetch active AI models dynamically from MongoDB database
  useEffect(() => {
    let isMounted = true;
    const fetchDbModels = async () => {
      try {
        const res = await api.get('/ai-models');
        const dbModels: Array<{ name: string; isActive?: boolean }> = res.data?.data?.models || [];
        const activeNames = dbModels
          .filter(m => m.isActive !== false)
          .map(m => m.name);

        if (isMounted && activeNames.length > 0) {
          setModelFilters(['All models', ...Array.from(new Set(activeNames))]);
        }
      } catch (err) {
        console.error('Failed to fetch AI models from database:', err);
      }
    };

    fetchDbModels();
    return () => { isMounted = false; };
  }, []);

  const fetchMentions = async (isMounted = true) => {
    setIsLoading(true);
    if (!activeBrandId) {
      const filtered = activeModel === 'All models'
        ? PROTOTYPE_MENTIONS
        : PROTOTYPE_MENTIONS.filter(m => m.model === activeModel);
      if (isMounted) {
        setMentions(filtered);
        setIsLoading(false);
      }
      return;
    }

    try {
      const modelParam = activeModel !== 'All models' ? `?model=${encodeURIComponent(activeModel)}` : '';
      const res = await api.get(`/brands/${activeBrandId}/mentions${modelParam}`);
      const data: MentionItem[] = res.data?.data?.mentions || [];
      if (isMounted) {
        setMentions(data);
      }
    } catch (err) {
      console.error('Failed to fetch mentions', err);
      if (isMounted) {
        setMentions([]);
      }
    } finally {
      if (isMounted) setIsLoading(false);
    }
  };

  // Fetch mentions whenever active brand or model filter changes
  useEffect(() => {
    let isMounted = true;
    fetchMentions(isMounted);
    return () => { isMounted = false; };
  }, [activeBrandId, activeModel]);

  const handleRescanMentions = async () => {
    if (!activeBrandId || isScanning) return;
    setIsScanning(true);
    setScanMessage(null);

    try {
      const res = await api.post(`/brands/${activeBrandId}/mentions/rescan`);
      if (res.data?.data?.status === 'queued') {
        setScanMessage('AI query scan queued in background worker! Polling updates...');
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          await fetchMentions(true);
          if (attempts >= 6) {
            clearInterval(interval);
            setIsScanning(false);
            setScanMessage('Background scan job is running in worker queue.');
            setTimeout(() => setScanMessage(null), 4000);
          }
        }, 3000);
      } else {
        const fresh: MentionItem[] = res.data?.data?.mentions || [];
        setMentions(fresh);
        setScanMessage('AI query scan completed successfully!');
        setIsScanning(false);
        setTimeout(() => setScanMessage(null), 4000);
      }
    } catch (err: any) {
      console.error('Failed to rescan mentions', err);
      setScanMessage(err.response?.data?.message || 'Scan failed. Please try again.');
      setIsScanning(false);
    }
  };

  const getTimeAgo = (dateStr: string) => {
    if (!dateStr) return '2h ago';
    const diffHours = Math.round((new Date().getTime() - new Date(dateStr).getTime()) / (1000 * 60 * 60));
    if (diffHours <= 1) return '2h ago';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div>
      {/* Header Bar with Action Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
            AI Query Mentions for {context?.currentBrand?.name || 'Brand'}
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-dim)' }}>
            Track real-time brand visibility and positioning across LLM responses
          </p>
        </div>
        <button
          onClick={handleRescanMentions}
          disabled={isScanning}
          style={{
            background: 'var(--panel-bg, #1e222d)',
            border: '1px solid var(--border-color, #2b303c)',
            borderRadius: '8px',
            padding: '8px 16px',
            color: 'var(--text-main, #ffffff)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: isScanning ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
          }}
        >
          <span className={`rescan-icon ${isScanning ? 'spinning' : ''}`} style={{ fontSize: '14px', display: 'inline-block' }}>
            ⚙
          </span>
          {isScanning ? 'Scanning Queries...' : 'Run AI Query Scan'}
        </button>
      </div>

      {scanMessage && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '6px',
            fontSize: '13px',
            marginBottom: '16px',
            background: scanMessage.includes('failed') ? '#fee2e2' : 'rgba(74,222,128,0.13)',
            color: scanMessage.includes('failed') ? '#ef4444' : 'var(--good, #4ade80)',
            border: `1px solid ${scanMessage.includes('failed') ? '#fca5a5' : 'var(--good, #4ade80)'}`
          }}
        >
          {scanMessage}
        </div>
      )}

      {/* Model Filter Row */}
      <div className="filter-row">
        {modelFilters.map((m) => (
          <button
            key={m}
            type="button"
            className={`filter-chip ${activeModel === m ? 'active' : ''}`}
            onClick={() => setActiveModel(m)}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Mentions Table Panel */}
      <div className="panel" style={{ padding: '8px 24px 20px' }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-dim)' }}>
            Loading query mentions...
          </div>
        ) : mentions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-dim)' }}>
            No mentions found for {activeModel}.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Query</th>
                <th>Model</th>
                <th>Mentioned</th>
                <th>Position</th>
                <th>Sentiment</th>
                <th>Last checked</th>
              </tr>
            </thead>
            <tbody>
              {mentions.map((row) => (
                <tr key={row._id}>
                  <td>{row.queryText}</td>
                  <td>{row.model}</td>
                  <td>
                    {row.mentioned ? (
                      <span className="pill pill-yes">Yes</span>
                    ) : (
                      <span className="pill pill-no">No</span>
                    )}
                  </td>
                  <td className="mono">{row.mentioned && row.position ? `#${row.position}` : '—'}</td>
                  <td
                    className={
                      !row.mentioned
                        ? 'sent-neu'
                        : row.sentiment === 'Positive'
                        ? 'sent-pos'
                        : row.sentiment === 'Negative'
                        ? 'sent-neg'
                        : 'sent-neu'
                    }
                  >
                    {row.mentioned ? row.sentiment : '—'}
                  </td>
                  <td className="mono">{getTimeAgo(row.extractedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
