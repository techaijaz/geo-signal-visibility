import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../utils/axios';

interface ModelResult {
  mentioned: boolean;
  position: number | null;
  sentiment: 'Positive' | 'Neutral' | 'Negative';
}

interface QueryRow {
  query: string;
  claude?: ModelResult;
  gpt?: ModelResult;
  gemini?: ModelResult;
}

interface FreeCheckResponse {
  brandName: string;
  website: string;
  score: number;
  results: QueryRow[];
  leadId?: string;
  nextStep?: string;
  sampleQueries?: string[];
}

export default function FreeVisibilityChecker() {
  const navigate = useNavigate();
  const [brandName, setBrandName] = useState('');
  const [website, setWebsite] = useState('');
  const [email, setEmail] = useState('');
  
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<FreeCheckResponse | null>(null);

  const scanSteps = [
    'Connecting to AI Provider API Network...',
    'Querying Anthropic Claude 3.5 Sonnet...',
    'Evaluating OpenAI GPT-4o mini recommendations...',
    'Analyzing Google Gemini 1.5 Flash outputs...',
    'Calculating Generative Engine Visibility Score...'
  ];

  const handleRunScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandName.trim() || !website.trim() || !email.trim()) {
      setErrorMsg('Please provide your brand name, website URL, and work email.');
      return;
    }

    setErrorMsg(null);
    setIsScanning(true);
    setScanStep(0);

    // Step animation interval
    const stepInterval = setInterval(() => {
      setScanStep((prev) => (prev < scanSteps.length - 1 ? prev + 1 : prev));
    }, 1200);

    try {
      const res = await api.post('/free-check', {
        brandName: brandName.trim(),
        website: website.trim(),
        email: email.trim(),
      });

      clearInterval(stepInterval);
      setIsScanning(false);
      setScanResult(res.data?.data || null);
    } catch (err: any) {
      clearInterval(stepInterval);
      setIsScanning(false);
      const msg = err.response?.data?.message || err.message || 'Failed to complete free scan. Please try again.';
      setErrorMsg(msg);
    }
  };

  const handleClaimAccount = () => {
    const queryParams = new URLSearchParams({
      email: email,
      brand: brandName,
    }).toString();
    navigate(`/signup?${queryParams}`);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background, #0b0f19)', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
      {/* Top Navbar */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(11,15,25,0.8)', backdropFilter: 'blur(10px)' }}>
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: '1.2rem' }}>
            S
          </div>
          <div>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>Signal GEO</span>
            <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(99,102,241,0.2)', color: '#818cf8', fontWeight: 600 }}>FREE CHECKER</span>
          </div>
        </Link>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link to="/pricing" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}>Pricing</Link>
          <Link to="/login" style={{ color: '#cbd5e1', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600, padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)' }}>Log In</Link>
          <Link to="/signup" style={{ background: '#6366f1', color: '#fff', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600, padding: '0.5rem 1.25rem', borderRadius: '8px' }}>Start Free Trial</Link>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '3rem 1.5rem' }}>
        {/* Hero Banner */}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', padding: '0.4rem 1rem', borderRadius: '999px', color: '#a5b4fc', fontSize: '0.85rem', fontWeight: 600, marginBottom: '1.25rem' }}>
            ⚡ Instant Free AI Scan Engine
          </div>
          <h1 style={{ fontSize: '2.75rem', fontWeight: 800, lineHeight: 1.2, marginBottom: '1rem', background: 'linear-gradient(180deg, #FFFFFF 0%, #cbd5e1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Is ChatGPT & Claude Recommending Your Brand?
          </h1>
          <p style={{ fontSize: '1.1rem', color: '#94a3b8', maxWidth: '680px', margin: '0 auto', lineHeight: 1.6 }}>
            Over 60% of buyers now use AI search assistants before purchasing. Run a free instant visibility audit to see where your brand stands.
          </p>
        </div>

        {/* Scan Input Form Card */}
        {!scanResult && (
          <div style={{ background: 'rgba(17, 24, 39, 0.7)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '2.5rem', backdropFilter: 'blur(12px)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
            <form onSubmit={handleRunScan}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.5rem' }}>Brand Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Mamaearth, boAt, Zomato"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    disabled={isScanning}
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.95rem', outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.5rem' }}>Website URL *</label>
                  <input
                    type="text"
                    placeholder="e.g. mamaearth.in"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    disabled={isScanning}
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.95rem', outline: 'none' }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.5rem' }}>Work Email (to receive report) *</label>
                  <input
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isScanning}
                    style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '0.95rem', outline: 'none' }}
                  />
                </div>
              </div>

              {errorMsg && (
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  ⚠️ {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={isScanning}
                style={{ width: '100%', padding: '1rem', borderRadius: '10px', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: '#fff', fontSize: '1.05rem', fontWeight: 700, border: 'none', cursor: isScanning ? 'not-allowed' : 'pointer', boxShadow: '0 4px 15px rgba(99,102,241,0.4)', transition: 'all 0.2s ease' }}
              >
                {isScanning ? '🔍 Scanning Live AI Search Models...' : '🚀 Check Free AI Visibility Score'}
              </button>
            </form>

            {/* Scan Progress Bar */}
            {isScanning && (
              <div style={{ marginTop: '2rem', padding: '1.25rem', background: 'rgba(15, 23, 42, 0.9)', borderRadius: '10px', border: '1px solid rgba(99,102,241,0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#a5b4fc', marginBottom: '0.5rem', fontWeight: 600 }}>
                  <span>{scanSteps[scanStep]}</span>
                  <span>{Math.round(((scanStep + 1) / scanSteps.length) * 100)}%</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${((scanStep + 1) / scanSteps.length) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #6366f1, #a855f7)', transition: 'width 0.4s ease' }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Results Dashboard Card */}
        {scanResult && (
          <div>
            {/* Header Result Summary */}
            <div style={{ background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '2rem', marginBottom: '2rem', backdropFilter: 'blur(12px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.85rem', color: '#818cf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scan Report Complete</span>
                <h2 style={{ fontSize: '2rem', fontWeight: 800, marginTop: '0.25rem', color: '#fff' }}>{scanResult.brandName}</h2>
                <p style={{ color: '#94a3b8', fontSize: '0.95rem', marginTop: '0.25rem' }}>{scanResult.website}</p>
                <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={() => setScanResult(null)}
                    style={{ padding: '0.5rem 1rem', borderRadius: '6px', background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.15)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    🔄 Test Another Brand
                  </button>
                </div>
              </div>

              {/* Score Circular Gauge */}
              <div style={{ textAlign: 'center', background: 'rgba(15, 23, 42, 0.6)', padding: '1.5rem', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600, marginBottom: '0.75rem' }}>AI VISIBILITY SCORE</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '110px', height: '110px', borderRadius: '50%', background: `conic-gradient(#6366f1 ${scanResult.score * 3.6}deg, rgba(255,255,255,0.1) 0deg)`, position: 'relative' }}>
                  <div style={{ width: '88px', height: '88px', borderRadius: '50%', background: '#0b0f19', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '1.8rem', fontWeight: 800, color: scanResult.score >= 50 ? '#4ade80' : '#f87171' }}>{scanResult.score}%</span>
                  </div>
                </div>
                <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: scanResult.score >= 50 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                  {scanResult.score >= 50 ? 'Good AI Presence' : 'Needs Optimization'}
                </div>
              </div>
            </div>

            {/* Model Breakdown Grid */}
            <div style={{ background: 'rgba(17, 24, 39, 0.8)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '16px', padding: '2rem', marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem', color: '#fff' }}>Query Breakdown Across AI Models</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>Shopping / Intent Query</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Claude 3.5</th>
                      <th style={{ padding: '0.75rem 1rem' }}>GPT-4o</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Gemini 1.5</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scanResult.results.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '1rem', fontWeight: 500, color: '#e2e8f0' }}>"{row.query}"</td>
                        {['claude', 'gpt', 'gemini'].map((mKey) => {
                          const res = row[mKey as keyof QueryRow] as ModelResult | undefined;
                          return (
                            <td key={mKey} style={{ padding: '1rem' }}>
                              {res?.mentioned ? (
                                <span style={{ padding: '0.25rem 0.6rem', borderRadius: '4px', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', fontSize: '0.8rem', fontWeight: 600 }}>
                                  ✓ Mentioned (#{res.position || 1})
                                </span>
                              ) : (
                                <span style={{ padding: '0.25rem 0.6rem', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', fontSize: '0.8rem', fontWeight: 600 }}>
                                  ✗ Not Mentioned
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* High Conversion CTA Box */}
            <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(168,85,247,0.2) 100%)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: '16px', padding: '2.5rem', textAlign: 'center' }}>
              <h3 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', marginBottom: '0.75rem' }}>
                Claim Your Full GEO Optimization Workspace
              </h3>
              <p style={{ color: '#cbd5e1', fontSize: '1rem', maxWidth: '600px', margin: '0 auto 1.75rem auto', lineHeight: 1.5 }}>
                Track 15+ custom brand queries, perform technical website audits (robots.txt, schema), get dynamic AI recommendation snippets, and outrank competitors.
              </p>
              <button
                onClick={handleClaimAccount}
                style={{ padding: '1rem 2.5rem', borderRadius: '10px', background: '#6366f1', color: '#fff', fontSize: '1.1rem', fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(99,102,241,0.5)' }}
              >
                🚀 Unlock Full Brand Report (Start 14-Day Free Trial)
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
