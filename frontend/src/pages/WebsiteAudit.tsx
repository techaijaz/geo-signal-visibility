import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../utils/axios';

interface AuditGridItem {
  name: string;
  status: string;
  badgeType: 'badge-ok' | 'badge-bad' | 'badge-warn';
}

interface AuditData {
  healthScore: number;
  holdingBack: string[];
  crawlerAccess: AuditGridItem[];
  structuredData: AuditGridItem[];
  offSiteFootprint: AuditGridItem[];
  marketplaceReadability: AuditGridItem[];
  lastAuditedAt?: string;
}

interface OutletContextType {
  currentBrand: { _id?: string; name: string; role: string };
  brands: Array<{ _id?: string; name: string; role?: string }>;
}

interface InfoTooltipProps {
  title: string;
  description: string;
  geoImpact: string;
}

const InfoTooltip = ({ title, description, geoImpact }: InfoTooltipProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: '6px', verticalAlign: 'middle' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => { setIsOpen(true); setIsHovered(true); }}
        onMouseLeave={() => { setIsOpen(false); setIsHovered(false); }}
        type="button"
        style={{
          background: isHovered ? 'rgba(245, 158, 11, 0.25)' : 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.4)',
          borderRadius: '50%',
          width: '20px',
          height: '20px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '12px',
          fontWeight: 700,
          fontFamily: 'serif',
          fontStyle: 'italic',
          color: '#f59e0b',
          cursor: 'pointer',
          padding: 0,
          lineHeight: 1,
          boxShadow: isHovered ? '0 0 8px rgba(245, 158, 11, 0.4)' : 'none',
          transform: isHovered ? 'scale(1.1)' : 'scale(1)',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          outline: 'none',
          flexShrink: 0
        }}
        title="Click or hover to learn why this section matters for AI Search Engines"
      >
        i
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: '0',
          width: '290px',
          background: '#161920',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '10px',
          padding: '14px 16px',
          boxShadow: '0 14px 36px rgba(0, 0, 0, 0.8)',
          zIndex: 9999,
          color: 'var(--text-main)',
          fontSize: '12.5px',
          textAlign: 'left',
          backdropFilter: 'blur(10px)',
          animation: 'fadeIn 0.15s ease-out'
        }}>
          {/* Arrow Tip */}
          <div style={{
            position: 'absolute',
            top: '-5px',
            left: '6px',
            width: '8px',
            height: '8px',
            background: '#161920',
            borderTop: '1px solid rgba(245, 158, 11, 0.3)',
            borderLeft: '1px solid rgba(245, 158, 11, 0.3)',
            transform: 'rotate(45deg)'
          }} />
          <strong style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', color: '#f59e0b', fontSize: '13px', fontWeight: 600 }}>
            <span>ℹ</span>
            <span>{title}</span>
          </strong>
          <p style={{ margin: '0 0 10px 0', lineHeight: 1.45, color: '#d1d5db', fontSize: '12px' }}>
            {description}
          </p>
          <div style={{ fontSize: '11px', color: '#10b981', background: 'rgba(16, 185, 129, 0.12)', padding: '8px 10px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.25)', lineHeight: 1.35 }}>
            💡 <strong style={{ color: '#34d399' }}>GEO Impact:</strong> {geoImpact}
          </div>
        </div>
      )}
    </div>
  );
};

export default function WebsiteAudit() {
  const context = useOutletContext<OutletContextType>();
  const activeBrandId = context?.currentBrand?._id;

  const [auditData, setAuditData] = useState<AuditData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRescanning, setIsRescanning] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState<string>('');

  useEffect(() => {
    let isMounted = true;

    const fetchAudit = async () => {
      if (!activeBrandId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const res = await api.get(`/brands/${activeBrandId}/audit`);
        if (isMounted && res.data?.data) {
          setAuditData(res.data.data.audit);
          setWebsiteUrl(res.data.data.website || '');
        }
      } catch (err) {
        console.error('Failed to fetch website audit data', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchAudit();

    return () => { isMounted = false; };
  }, [activeBrandId]);

  const handleRescan = async () => {
    if (!activeBrandId || isRescanning) return;
    setIsRescanning(true);

    try {
      const res = await api.post(`/brands/${activeBrandId}/audit/rescan`);
      if (res.data?.data?.status === 'queued') {
        let attempts = 0;
        const interval = setInterval(async () => {
          attempts++;
          try {
            const pollRes = await api.get(`/brands/${activeBrandId}/audit`);
            if (pollRes.data?.data?.audit) {
              setAuditData(pollRes.data.data.audit);
              if (pollRes.data.data.website) setWebsiteUrl(pollRes.data.data.website);
            }
          } catch (e) {
            console.error('Polling audit error:', e);
          }
          if (attempts >= 6) {
            clearInterval(interval);
            setIsRescanning(false);
          }
        }, 3000);
      } else if (res.data?.data) {
        setAuditData(res.data.data.audit);
        if (res.data.data.website) setWebsiteUrl(res.data.data.website);
        setIsRescanning(false);
      }
    } catch (err) {
      console.error('Failed to rescan website audit', err);
      setIsRescanning(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-dim)' }}>
        <span className="rescan-icon spinning" style={{ fontSize: '24px', display: 'inline-block', marginBottom: '10px' }}>⚙</span>
        <p>Analyzing website & technical SEO signals...</p>
      </div>
    );
  }

  // Data derived from backend response or empty state
  const healthScore = auditData?.healthScore ?? 0;
  const holdingBackList = auditData?.holdingBack || [];
  const crawlerAccess = auditData?.crawlerAccess || [];
  const structuredData = auditData?.structuredData || [];
  const offSiteFootprint = auditData?.offSiteFootprint || [];
  const marketplaceReadability = auditData?.marketplaceReadability || [];

  // Color indicator for Health Score
  const scoreColor = healthScore >= 80 ? '#10b981' : healthScore >= 50 ? '#f59e0b' : '#ef4444';

  // Check for Security Blocker / Warning
  const securityIssue = holdingBackList.find(issue => issue.toUpperCase().includes('SECURITY'));

  return (
    <div>
      {/* Security Alert Banner */}
      {securityIssue && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid #ef4444',
          borderRadius: '8px',
          padding: '16px 20px',
          marginBottom: '24px',
          color: '#ef4444',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px'
        }}>
          <span style={{ fontSize: '24px', lineHeight: 1 }}>🛡️</span>
          <div>
            <strong style={{ fontSize: '15px', display: 'block', marginBottom: '4px' }}>Scan Aborted - Website Unsecure</strong>
            <span>{securityIssue} Please enable HTTPS / SSL certificate on your domain to unlock technical GEO audit checks.</span>
          </div>
        </div>
      )}

      {/* Header bar with website URL & Rescan button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
            Technical Audit for {context?.currentBrand?.name || 'Website'}
          </h2>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '4px' }}>
            {websiteUrl && (
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-faint)' }}>
                Domain: <a href={websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`} target="_blank" rel="noreferrer" style={{ color: 'var(--amber)', textDecoration: 'none' }}>{websiteUrl}</a>
              </p>
            )}
            {auditData?.lastAuditedAt && (
              <span style={{ fontSize: '12px', color: 'var(--text-faint)' }}>
                Last Scanned: {new Date(auditData.lastAuditedAt).toLocaleString()}
              </span>
            )}
          </div>
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
            transition: 'all 0.2s ease'
          }}
        >
          <span className={`rescan-icon ${isRescanning ? 'spinning' : ''}`} style={{ fontSize: '14px', display: 'inline-block' }}>
            ⚙
          </span>
          {isRescanning ? 'Scanning Live Website...' : 'Re-scan Website Audit'}
        </button>
      </div>

      {/* Top Cards Row */}
      <div className="cards-row" style={{ gridTemplateColumns: '1fr 3fr' }}>
        <div className="card" style={{ borderColor: scoreColor }}>
          <div className="label" style={{ display: 'flex', alignItems: 'center' }}>
            <span>Audit health</span>
            <InfoTooltip
              title="Audit Health Score"
              description="Overall technical readiness score of your website for AI engines out of 100."
              geoImpact="Higher scores mean AI bots (ChatGPT, Perplexity, Gemini) can easily crawl, index, and cite your website."
            />
          </div>
          <div className="score-big" style={{ color: scoreColor }}>{healthScore}</div>
          <div className="score-delta" style={{ color: 'var(--text-faint)' }}>out of 100</div>
        </div>
        <div className="card">
          <div className="label" style={{ display: 'flex', alignItems: 'center' }}>
            <span>What's holding you back</span>
            <InfoTooltip
              title="Critical Technical Issues"
              description="Lists exact website errors, missing schemas, or bot blocks detected during live scanning."
              geoImpact="Resolving these items directly unlocks higher AI visibility and prevents your site from being ignored."
            />
          </div>
          <ul className="issue-list">
            {holdingBackList.length > 0 ? (
              holdingBackList.map((issue, idx) => (
                <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ color: '#ef4444', fontSize: '14px' }}>⚠</span>
                  <span>{issue}</span>
                </li>
              ))
            ) : (
              <li style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>✓</span>
                <span>All technical GEO checks passed clean! No critical issues holding back your website.</span>
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* 1. Crawler Access Panel */}
      <div className="panel">
        <h3 style={{ display: 'flex', alignItems: 'center' }}>
          <span>Crawler access</span>
          <InfoTooltip
            title="AI Crawler Access"
            description="Checks if AI scrapers (GPTBot, ClaudeBot, Gemini) are allowed in robots.txt and whether /llms.txt exists."
            geoImpact="If a bot is blocked in robots.txt, that AI engine cannot crawl your website to fetch fresh company info."
          />
        </h3>
        <p className="sub">Whether AI crawlers can even read your site</p>
        <div className="audit-grid">
          {crawlerAccess.length > 0 ? (
            crawlerAccess.map((item, idx) => (
              <div key={idx} className="audit-item">
                <span className="name">{item.name}</span>
                <span className={`badge ${item.badgeType}`}>{item.status}</span>
              </div>
            ))
          ) : (
            <p style={{ color: 'var(--text-faint)', fontSize: '13px', margin: 0 }}>Click "Re-scan Website Audit" above to analyze crawler access.</p>
          )}
        </div>
      </div>

      {/* 2. Structured Data Panel */}
      <div className="panel">
        <h3 style={{ display: 'flex', alignItems: 'center' }}>
          <span>Structured data</span>
          <InfoTooltip
            title="Structured Data (Schema.org)"
            description="Standardized JSON-LD markup (Organization, Product, FAQPage) embedded in your code."
            geoImpact="AI engines use FAQPage and Product schemas to generate direct answer boxes and citations."
          />
        </h3>
        <p className="sub">Schema.org markup found on your site</p>
        <div className="audit-grid">
          {structuredData.length > 0 ? (
            structuredData.map((item, idx) => (
              <div key={idx} className="audit-item">
                <span className="name">{item.name}</span>
                <span className={`badge ${item.badgeType}`}>{item.status}</span>
              </div>
            ))
          ) : (
            <p style={{ color: 'var(--text-faint)', fontSize: '13px', margin: 0 }}>Click "Re-scan Website Audit" above to analyze structured data schemas.</p>
          )}
        </div>
      </div>

      {/* 3. Off-site Footprint Panel */}
      <div className="panel">
        <h3 style={{ display: 'flex', alignItems: 'center' }}>
          <span>Off-site footprint</span>
          <InfoTooltip
            title="Off-site Footprint"
            description="Checks Google search indexing, Wikipedia presence, and database AI mention citations."
            geoImpact="AI models trust your brand more when third-party authoritative sources validate your identity."
          />
        </h3>
        <p className="sub">Third-party sources AI models cite heavily alongside your own site</p>
        <div className="audit-grid">
          {offSiteFootprint.length > 0 ? (
            offSiteFootprint.map((item, idx) => (
              <div key={idx} className="audit-item">
                <span className="name">{item.name}</span>
                <span className={`badge ${item.badgeType}`}>{item.status}</span>
              </div>
            ))
          ) : (
            <p style={{ color: 'var(--text-faint)', fontSize: '13px', margin: 0 }}>Click "Re-scan Website Audit" above to analyze off-site footprint.</p>
          )}
        </div>
      </div>

      {/* 4. Marketplace & Sales Channels Panel */}
      <div className="panel">
        <h3 style={{ display: 'flex', alignItems: 'center' }}>
          <span>Marketplace & Sales Channels</span>
          <InfoTooltip
            title="Marketplace & Sales Channels"
            description="Verifies linked sales platforms (IndiaMART, Amazon, Flipkart, Shopify, G2, etc.)."
            geoImpact="AI shopping assistants fetch product specs and reviews directly from these linked marketplaces to recommend your products."
          />
        </h3>
        <p className="sub">
          AI engines (ChatGPT, Gemini, Perplexity) fetch product listings and reviews directly from platforms linked on your website (IndiaMART, Amazon, Shopify, G2, etc.)
        </p>
        <div className="audit-grid">
          {marketplaceReadability.length > 0 ? (
            marketplaceReadability.map((item, idx) => (
              <div key={idx} className="audit-item">
                <span className="name">{item.name}</span>
                <span className={`badge ${item.badgeType}`}>{item.status}</span>
              </div>
            ))
          ) : (
            <p style={{ color: 'var(--text-faint)', fontSize: '13px', margin: 0 }}>Click "Re-scan Website Audit" above to analyze sales channels.</p>
          )}
        </div>
      </div>
    </div>
  );
}
