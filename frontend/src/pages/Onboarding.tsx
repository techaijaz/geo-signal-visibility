import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../utils/axios';
import { usePlanLimits } from '../hooks/usePlanLimits';
import { generateCategoryQueries, type QueryItem } from '../utils/categoryQueryGenerator';

const FALLBACK_CATEGORIES = [
  'SaaS & Software',
  'E-Commerce & Retail',
  'FinTech & Banking',
  'HealthTech & Healthcare',
  'EdTech & Learning',
  'Skincare & Personal Care',
  'Beauty & Cosmetics',
  'Food & Beverage',
  'Travel & Hospitality',
  'Real Estate & Property',
  'Automotive & Mobility',
  'Consumer Electronics & Gadgets',
  'Home, Furniture & Living',
  'Fashion, Apparel & Accessories',
  'Media, Gaming & Entertainment',
  'Artificial Intelligence & ML',
  'Cybersecurity & Data Privacy',
  'Cloud, DevOps & Infrastructure',
  'Marketing, Advertising & PR',
  'HRTech & Recruitment',
  'LegalTech & Compliance',
  'Logistics, Supply Chain & Delivery',
  'Fitness, Sports & Wellness',
  'Jewelry, Watches & Luxury Goods',
  'Mother, Baby & Kids Care',
  'Pet Care & Supplies',
  'Agriculture & AgriTech',
  'Renewable Energy & CleanTech',
  'Crypto, Web3 & Blockchain',
  'Construction & Architecture',
  'Professional & Business Services',
  'Non-Profit, NGO & Social Impact',
  'Events, Ticketing & Entertainment',
  'Industrial, Manufacturing & B2B',
  'Insurance & InsurTech',
  'Other / General'
];

interface Competitor {
  name: string;
  website?: string;
}

const SUGGESTED_COMPETITORS: string[] = [];

export default function Onboarding() {
  const navigate = useNavigate();
  const { limits, plan } = usePlanLimits();
  const maxQueries = limits?.maxQueries ?? 15;
  const maxCompetitors = limits?.maxCompetitors ?? 5;

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 State: Brand Info
  const [brandName, setBrandName] = useState('');
  const [website, setWebsite] = useState('');
  const [category, setCategory] = useState('SaaS & Software');
  const [businessType, setBusinessType] = useState<'ecommerce' | 'saas' | 'service' | 'local_business' | 'content_media'>('saas');
  const [categoriesList, setCategoriesList] = useState<string[]>(FALLBACK_CATEGORIES);
  const [region, setRegion] = useState('India');
  const [step1Error, setStep1Error] = useState('');

  // Fetch categories from DB on mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await api.get('/categories');
        const fetchedCats = res.data?.data?.categories || res.data?.categories || [];
        if (Array.isArray(fetchedCats) && fetchedCats.length > 0) {
          const names = fetchedCats.map((c: any) => (typeof c === 'string' ? c : c.name)).filter(Boolean);
          if (names.length > 0) {
            setCategoriesList(names);
            setCategory((prev) => (names.includes(prev) ? prev : names[0]));
          }
        }
      } catch (err) {
        console.error('Error fetching categories from DB:', err);
      }
    };
    fetchCategories();
  }, []);

  // Step 2 State: Competitors
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [competitorInput, setCompetitorInput] = useState('');
  const [step2Error, setStep2Error] = useState('');

  // Step 3 State: Category-based Queries
  const [queries, setQueries] = useState<QueryItem[]>(() => generateCategoryQueries('SaaS & Software', ''));
  const [customQueryInput, setCustomQueryInput] = useState('');
  const [step3Error, setStep3Error] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dynamically update queries when Category or Brand Name changes
  useEffect(() => {
    setQueries(generateCategoryQueries(category, brandName));
  }, [category, brandName]);

  const activeQueriesCount = queries.filter((q) => q.enabled).length;

  // URL normalization helper
  const normalizeWebsite = (url: string) => {
    let clean = url.trim().toLowerCase();
    clean = clean.replace(/^(https?:\/\/)?(www\.)?/, '');
    clean = clean.replace(/\/$/, '');
    return clean.split('/')[0].split('?')[0];
  };

  const handleStep1Next = (e: React.FormEvent) => {
    e.preventDefault();
    setStep1Error('');

    if (!brandName.trim()) {
      setStep1Error('Brand name is required.');
      return;
    }
    if (!website.trim()) {
      setStep1Error('Website URL is required.');
      return;
    }

    const cleanWeb = normalizeWebsite(website);
    if (!cleanWeb.includes('.')) {
      setStep1Error('Please enter a valid website domain (e.g. example.com)');
      return;
    }

    setWebsite(`https://${cleanWeb}`);
    setStep(2);
  };

  // Helper to check if competitor name/URL is own brand or own website
  const isSelfBrandOrWebsite = (nameOrUrl: string) => {
    const trimmed = nameOrUrl.trim().toLowerCase();
    if (!trimmed) return { isSelf: false, error: '' };

    const cleanBrandName = brandName.trim().toLowerCase();
    const cleanBrandWeb = normalizeWebsite(website);
    const cleanInputWeb = normalizeWebsite(nameOrUrl);

    if (cleanBrandName && trimmed === cleanBrandName) {
      return {
        isSelf: true,
        error: `You cannot add your own brand ("${brandName}") as a competitor.`
      };
    }

    if (cleanBrandWeb && (cleanInputWeb === cleanBrandWeb || trimmed === cleanBrandWeb)) {
      return {
        isSelf: true,
        error: `You cannot add your brand's website ("${website}") as a competitor.`
      };
    }

    return { isSelf: false, error: '' };
  };

  const handleAddCompetitor = () => {
    setStep2Error('');
    const trimmed = competitorInput.trim();
    if (!trimmed) return;

    if (competitors.length >= maxCompetitors) {
      setStep2Error(`Your ${plan.toUpperCase()} plan allows maximum ${maxCompetitors} competitors. Upgrade plan to add more.`);
      return;
    }

    const { isSelf, error } = isSelfBrandOrWebsite(trimmed);
    if (isSelf) {
      setStep2Error(error);
      return;
    }

    if (competitors.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setStep2Error(`"${trimmed}" is already in your competitor list.`);
      return;
    }

    setCompetitors([...competitors, { name: trimmed }]);
    setCompetitorInput('');
  };

  const handleAddSuggestedCompetitor = (name: string) => {
    setStep2Error('');

    if (competitors.length >= maxCompetitors) {
      setStep2Error(`Your ${plan.toUpperCase()} plan allows maximum ${maxCompetitors} competitors. Upgrade plan to add more.`);
      return;
    }

    const { isSelf, error } = isSelfBrandOrWebsite(name);
    if (isSelf) {
      setStep2Error(error);
      return;
    }

    if (competitors.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      setStep2Error(`"${name}" is already in your competitor list.`);
      return;
    }
    setCompetitors([...competitors, { name }]);
  };

  const handleRemoveCompetitor = (index: number) => {
    setCompetitors(competitors.filter((_, i) => i !== index));
  };

  const handleToggleQuery = (id: string) => {
    setStep3Error('');
    const target = queries.find((q) => q.id === id);
    if (!target) return;

    // Check plan limits when turning ON a query
    if (!target.enabled && activeQueriesCount >= maxQueries) {
      setStep3Error(`Your ${plan.toUpperCase()} plan allows maximum ${maxQueries} active queries. Upgrade plan to select more.`);
      return;
    }

    setQueries((prev) =>
      prev.map((q) => (q.id === id ? { ...q, enabled: !q.enabled } : q))
    );
  };

  const handleAddCustomQuery = () => {
    setStep3Error('');
    const trimmed = customQueryInput.trim();
    if (!trimmed) return;

    if (activeQueriesCount >= maxQueries) {
      setStep3Error(`Your ${plan.toUpperCase()} plan allows maximum ${maxQueries} active queries. Please uncheck existing queries or upgrade your plan.`);
      return;
    }

    if (queries.some((q) => q.text.toLowerCase() === trimmed.toLowerCase())) {
      setStep3Error('Query is already added.');
      return;
    }

    const isHinglish = /\b(kaunsa|sasta|accha|hai|ke|liye|kaise)\b/i.test(trimmed);

    setQueries([
      ...queries,
      {
        id: `q-${Date.now()}`,
        text: trimmed,
        lang: isHinglish ? 'HI-EN' : 'EN',
        intent: 'Direct',
        enabled: true,
      },
    ]);
    setCustomQueryInput('');
  };

  const handleCompleteOnboarding = async () => {
    setStep3Error('');
    const activeQueries = queries.filter((q) => q.enabled);

    if (activeQueries.length === 0) {
      setStep3Error('At least 1 active query must be selected to finish setup.');
      return;
    }

    if (activeQueries.length > maxQueries) {
      setStep3Error(`Your ${plan.toUpperCase()} plan allows maximum ${maxQueries} queries. You have selected ${activeQueries.length}.`);
      return;
    }

    setIsSubmitting(true);

    try {
      await api.post('/brands', {
        name: brandName,
        website: website,
        category: category,
        businessType: businessType,
        region: region,
        competitors: competitors,
        queries: activeQueries.map((q) => ({
          text: q.text,
          intent: q.intent,
          lang: q.lang,
          enabled: q.enabled,
        })),
      });

      // Redirect to main workspace overview
      navigate('/');
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to complete onboarding.';
      setStep3Error(msg);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="onb-shell">
      {/* Top Bar */}
      <div className="onb-topbar">
        <Link to="/" className="brand-mark">
          <span className="dot"></span>
          <span>Signal</span>
        </Link>
        <button className="btn btn-ghost" onClick={() => navigate('/')}>
          Exit setup
        </button>
      </div>

      {/* Stepper */}
      <div className="onb-topbar" style={{ marginBottom: '28px' }}>
        <div className="stepper">
          <div className={`step ${step === 1 ? 'active' : step > 1 ? 'done' : ''}`}>
            <span className="num">{step > 1 ? '✓' : '1'}</span>
            <span>Brand</span>
          </div>
          <div className="step-line"></div>
          <div className={`step ${step === 2 ? 'active' : step > 2 ? 'done' : ''}`}>
            <span className="num">{step > 2 ? '✓' : '2'}</span>
            <span>Competitors</span>
          </div>
          <div className="step-line"></div>
          <div className={`step ${step === 3 ? 'active' : ''}`}>
            <span className="num">3</span>
            <span>Queries</span>
          </div>
        </div>
      </div>

      {/* Step 1: Brand Details */}
      {step === 1 && (
        <div className="onb-card">
          <h2>Tell us about your brand</h2>
          <p className="sub">This is what Signal will track inside AI model responses.</p>
          <form onSubmit={handleStep1Next}>
            <div className="field">
              <label htmlFor="brandName">Brand name</label>
              <input
                id="brandName"
                type="text"
                placeholder="e.g. Verdant Skincare or Signal"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="website">Website domain</label>
              <input
                id="website"
                type="text"
                placeholder="e.g. verdantskincare.in"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
            <div className="onb-grid">
              <div className="field">
                <label htmlFor="category">Category</label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {categoriesList.map((catName) => (
                    <option key={catName} value={catName}>
                      {catName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="businessType">Business Niche / Type</label>
                <select
                  id="businessType"
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value as any)}
                >
                  <option value="saas">💼 B2B / SaaS / Software</option>
                  <option value="ecommerce">🛒 E-Commerce & Retail Store</option>
                  <option value="service">🏥 Professional Service / Agency</option>
                  <option value="local_business">📍 Local Business & Storefront</option>
                  <option value="content_media">📰 Blog / Media / Content Platform</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="region">Primary Market</label>
                <select
                  id="region"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                >
                  <option value="India">India</option>
                  <option value="India + Global">India + Global</option>
                  <option value="United States">United States</option>
                  <option value="Global">Global</option>
                </select>
              </div>
            </div>

            {step1Error && <p className="error-text" style={{ marginBottom: '16px' }}>{step1Error}</p>}

            <div className="onb-actions">
              <button type="button" className="btn btn-ghost" onClick={() => navigate('/')}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Continue →
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Step 2: Competitors */}
      {step === 2 && (
        <div className="onb-card">
          <h2>Who are you up against?</h2>
          <p className="sub">
            Signal will track competitor visibility alongside {brandName || 'your brand'} in AI responses.
          </p>

          {/* Plan Competitor Limits Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12.5px',
            padding: '10px 14px',
            background: 'var(--ink-2, #181c24)',
            border: '1px solid var(--line-soft, #262b36)',
            borderRadius: '8px',
            margin: '12px 0 16px 0'
          }}>
            <span>
              <strong>Plan Allowance:</strong> {competitors.length} / {maxCompetitors === Infinity ? 'Unlimited' : maxCompetitors} competitors added
              <span style={{ color: 'var(--text-dim)', marginLeft: '6px', fontSize: '11px', textTransform: 'uppercase' }}>({plan} plan)</span>
            </span>
            {competitors.length >= maxCompetitors && (
              <Link to="/pricing" style={{ color: 'var(--amber, #f59e0b)', fontWeight: 600, textDecoration: 'underline' }}>
                Upgrade plan →
              </Link>
            )}
          </div>

          <div className="chip-row">
            {competitors.length === 0 ? (
              <span className="sub" style={{ fontSize: '12.5px', marginBottom: 0 }}>
                No competitors added yet. Add below or pick suggested.
              </span>
            ) : (
              competitors.map((comp, idx) => (
                <span key={idx} className="chip">
                  {comp.name}
                  <button type="button" onClick={() => handleRemoveCompetitor(idx)}>
                    ×
                  </button>
                </span>
              ))
            )}
          </div>

          <div className="add-row">
            <input
              type="text"
              placeholder={
                competitors.length >= maxCompetitors
                  ? `Limit reached (${maxCompetitors}/${maxCompetitors} competitors). Upgrade plan to add more.`
                  : "Add a competitor name..."
              }
              value={competitorInput}
              disabled={competitors.length >= maxCompetitors}
              onChange={(e) => setCompetitorInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCompetitor();
                }
              }}
            />
            <button
              type="button"
              className="btn"
              disabled={competitors.length >= maxCompetitors}
              onClick={handleAddCompetitor}
            >
              Add
            </button>
          </div>

          {step2Error && <p className="error-text" style={{ marginBottom: '12px', color: '#ef4444' }}>{step2Error}</p>}

          <div className="suggested-label">Suggested for {category}</div>
          <div className="chip-row">
            {SUGGESTED_COMPETITORS.map((name) => (
              <button
                key={name}
                type="button"
                className="suggest-chip"
                onClick={() => handleAddSuggestedCompetitor(name)}
              >
                + {name}
              </button>
            ))}
          </div>

          <div className="onb-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Queries */}
      {step === 3 && (
        <div className="onb-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h2>Pick what to track</h2>
              <p className="sub">
                Auto-generated search prompts tailored for <strong>{category}</strong>. Uncheck queries you don't need or add custom ones.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: '12px', padding: '4px 10px' }}
              onClick={() => setQueries(generateCategoryQueries(category, brandName))}
              title={`Reset queries for ${category}`}
            >
              ↻ Reset for {category}
            </button>
          </div>

          {/* Plan Query Limits Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '12.5px',
            padding: '10px 14px',
            background: 'var(--ink-2, #181c24)',
            border: '1px solid var(--line-soft, #262b36)',
            borderRadius: '8px',
            margin: '12px 0 16px 0'
          }}>
            <span>
              <strong>Plan Allowance:</strong> {activeQueriesCount} / {maxQueries === Infinity ? 'Unlimited' : maxQueries} queries selected
              <span style={{ color: 'var(--text-dim)', marginLeft: '6px', fontSize: '11px', textTransform: 'uppercase' }}>({plan} plan)</span>
            </span>
            {activeQueriesCount >= maxQueries && (
              <Link to="/pricing" style={{ color: 'var(--amber, #f59e0b)', fontWeight: 600, textDecoration: 'underline' }}>
                Upgrade plan →
              </Link>
            )}
          </div>

          <div className="query-list">
            {queries.map((q) => (
              <label key={q.id} className="query-row">
                <input
                  type="checkbox"
                  checked={q.enabled}
                  onChange={() => handleToggleQuery(q.id)}
                />
                <span className="query-text">{q.text}</span>
                <span className="tag tag-lang">{q.lang}</span>
                <span
                  className={`tag tag-${q.intent.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                >
                  {q.intent}
                </span>
              </label>
            ))}
          </div>

          <div className="add-row">
            <input
              type="text"
              placeholder={
                activeQueriesCount >= maxQueries
                  ? `Plan limit reached (${maxQueries}/${maxQueries} queries). Upgrade plan to add custom queries.`
                  : "Add a custom query (e.g. Best software for small businesses)..."
              }
              value={customQueryInput}
              disabled={activeQueriesCount >= maxQueries}
              onChange={(e) => setCustomQueryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustomQuery();
                }
              }}
            />
            <button
              type="button"
              className="btn"
              disabled={activeQueriesCount >= maxQueries}
              onClick={handleAddCustomQuery}
            >
              Add
            </button>
          </div>

          {activeQueriesCount < 3 && (
            <p className="sub" style={{ fontSize: '12px', color: 'var(--amber, #f59e0b)', margin: '8px 0' }}>
              ⚠️ Selecting at least 3 queries provides a stronger AI visibility score signal.
            </p>
          )}

          {step3Error && <p className="error-text" style={{ marginBottom: '12px', color: '#ef4444' }}>{step3Error}</p>}

          <div className="onb-actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={isSubmitting}
              onClick={() => setStep(2)}
            >
              ← Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={isSubmitting}
              onClick={handleCompleteOnboarding}
            >
              {isSubmitting ? 'Saving brand & setting up scan...' : 'Run first scan →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
