import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../utils/axios';

interface SovItem {
  name: string;
  label: string;
  percentage: number;
  color: string;
  isUserBrand: boolean;
}

interface HeadToHeadItem {
  name: string;
  mentionRate: string;
  avgPosition: string;
  trend: string;
  isUserBrand: boolean;
}

interface CompetitorData {
  brandId: string;
  brandName: string;
  shareOfVoice: SovItem[];
  headToHead: HeadToHeadItem[];
  summary: string;
}

interface OutletContextType {
  currentBrand: { _id?: string; name: string; role: string };
  brands: Array<{ _id?: string; name: string; role?: string }>;
}

export default function Competitors() {
  const context = useOutletContext<OutletContextType>();
  const activeBrandId = context?.currentBrand?._id;

  const [data, setData] = useState<CompetitorData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchCompetitorsData = async () => {
      if (!activeBrandId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const res = await api.get(`/brands/${activeBrandId}/competitors/compare`);
        const resData: CompetitorData = res.data?.data;
        if (isMounted && resData) {
          setData(resData);
        }
      } catch (err) {
        console.error('Failed to fetch competitor comparison data', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchCompetitorsData();

    return () => { isMounted = false; };
  }, [activeBrandId]);

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--text-dim)' }}>
        <span className="rescan-icon spinning" style={{ fontSize: '24px', display: 'inline-block', marginBottom: '10px' }}>⚙</span>
        <p>Loading competitor share of voice...</p>
      </div>
    );
  }

  const userBrandName = context?.currentBrand?.name || 'Your Brand';
  const sovList = data?.shareOfVoice || [
    { name: userBrandName, label: `${userBrandName} (you)`, percentage: 100, color: '#FFC857', isUserBrand: true }
  ];

  const headToHeadList = data?.headToHead || [
    { name: `${userBrandName} (you)`, mentionRate: '0%', avgPosition: '—', trend: 'flat', isUserBrand: true }
  ];

  const summaryText = data?.summary || `No competitor comparison data available yet. Add competitors in settings and run an AI scan to compare Share of Voice.`;

  return (
    <div>
      {/* 1. Share of Voice Panel */}
      <div className="panel">
        <h3>Share of voice</h3>
        <p className="sub">Of all tracked mentions this week, who's actually showing up</p>

        <div className="sov-bar">
          {sovList.map((item, idx) => (
            <div
              key={idx}
              className="sov-seg"
              style={{
                width: `${item.percentage}%`,
                background: item.color,
                color: item.color === '#FFC857' || item.color === '#D97757' ? '#0A0E16' : '#E9ECF3'
              }}
            >
              {item.name} · {item.percentage}%
            </div>
          ))}
        </div>

        <div className="sov-legend">
          {sovList.map((item, idx) => (
            <div key={idx} className="sov-legend-item">
              <span className="sov-legend-swatch" style={{ background: item.color }}></span>
              {item.isUserBrand ? `${item.name} (you)` : item.name}
            </div>
          ))}
        </div>
      </div>

      {/* 2. Head-to-head Panel */}
      <div className="panel">
        <h3>Head-to-head</h3>
        <p className="sub">{summaryText}</p>

        <table>
          <thead>
            <tr>
              <th>Competitor</th>
              <th>Mention rate</th>
              <th>Avg. position</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {headToHeadList.map((row, idx) => (
              <tr key={idx}>
                <td style={{ fontWeight: row.isUserBrand ? 600 : 400 }}>{row.name}</td>
                <td>{row.mentionRate}</td>
                <td className="mono">{row.avgPosition}</td>
                <td className={row.trend.includes('rising') ? 'sent-pos' : 'sent-neu'}>
                  {row.trend}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
