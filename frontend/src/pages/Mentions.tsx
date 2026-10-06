import { useState, useEffect, useRef } from 'react';
import { useOutletContext, useLocation, useNavigate } from 'react-router-dom';
import api from '../utils/axios';
import { timeAgo } from '../utils/timeAgo';
import ScanErrorBanner, { type ScanError } from '../components/ScanErrorBanner';
import ScanProgress from '../components/ScanProgress';

interface ScanState {
  lastScannedAt: string | null;
  lastScanError: ScanError | null;
  lastScanSilentModels?: string[];
}

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
  const location = useLocation();
  const navigate = useNavigate();
  const handoffWatched = useRef(false);

  const [modelFilters, setModelFilters] = useState<string[]>(DEFAULT_MODEL_FILTERS);
  const [activeModel, setActiveModel] = useState('All models');
  const [mentions, setMentions] = useState<MentionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanState, setScanState] = useState<ScanState>({ lastScannedAt: null, lastScanError: null });

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

  const fetchMentions = async (isMounted = true): Promise<ScanState | null> => {
    setIsLoading(true);
    if (!activeBrandId) {
      const filtered = activeModel === 'All models'
        ? PROTOTYPE_MENTIONS
        : PROTOTYPE_MENTIONS.filter(m => m.model === activeModel);
      if (isMounted) {
        setMentions(filtered);
        setIsLoading(false);
      }
      return null;
    }

    try {
      const modelParam = activeModel !== 'All models' ? `?model=${encodeURIComponent(activeModel)}` : '';
      const res = await api.get(`/brands/${activeBrandId}/mentions${modelParam}`);
      const data: MentionItem[] = res.data?.data?.mentions || [];
      const state: ScanState = {
        lastScannedAt: res.data?.data?.lastScannedAt ?? null,
        lastScanError: res.data?.data?.lastScanError ?? null,
        lastScanSilentModels: res.data?.data?.lastScanSilentModels ?? []
      };
      if (isMounted) {
        setMentions(data);
        setScanState(state);
      }
      return state;
    } catch (err) {
      console.error('Failed to fetch mentions', err);
      if (isMounted) {
        setMentions([]);
      }
      return null;
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
        watchScan(scanState);
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

  // Poll until the scan saves results or records a failure: either timestamp moves past `before`
  const watchScan = (before: ScanState) => {
    setIsScanning(true);
    setScanMessage(null);
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      const now = await fetchMentions(true);
      const failed = now?.lastScanError && now.lastScanError.at !== before.lastScanError?.at;
      const done = now?.lastScannedAt && now.lastScannedAt !== before.lastScannedAt;
      if (failed || done || attempts >= 36) {
        clearInterval(interval);
        setIsScanning(false);
        setScanMessage(failed ? null : done ? 'Scan complete.' : 'The scan is taking longer than usual. Results will show here when it finishes.');
        if (!failed) setTimeout(() => setScanMessage(null), 6000);
      }
    }, 5000);
  };

  // Header and Settings start a scan, then send the user here to watch it
  useEffect(() => {
    // The ref stops React's dev double-run of effects from starting two polling loops
    if (handoffWatched.current || !(location.state as { scanStarted?: boolean } | null)?.scanStarted) return;
    handoffWatched.current = true;
    navigate(location.pathname, { replace: true, state: null });
    fetchMentions(true).then((s) => watchScan(s ?? { lastScannedAt: null, lastScanError: null }));
  }, []);

  const getTimeAgo = (dateStr: string) => timeAgo(dateStr) ?? '—';

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

      {isScanning && <ScanProgress title="Scanning AI answers" hint="Asking each AI your tracked questions. This takes a minute or two." />}
      {!isScanning && <ScanErrorBanner error={scanState.lastScanError} silentModels={scanState.lastScanSilentModels} />}

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
