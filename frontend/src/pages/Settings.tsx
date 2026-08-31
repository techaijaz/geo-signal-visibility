import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useOutletContext, Link } from 'react-router-dom';
import api from '../utils/axios';
import { useAuth } from '../context/AuthContext';
import { usePlanLimits } from '../hooks/usePlanLimits';
import { generateCategoryQueries } from '../utils/categoryQueryGenerator';

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

interface QueryItem {
  text: string;
  intent?: string;
  lang?: string;
  enabled?: boolean;
}

interface BrandData {
  _id: string;
  name: string;
  website: string;
  category: string;
  businessType?: string;
  region: string;
  role?: string;
  competitors: Competitor[];
  queries: QueryItem[];
}

interface OutletContextType {
  currentBrand?: { _id?: string; name?: string; role?: string };
  brands?: BrandData[];
  setCurrentBrand?: (b: { _id?: string; name: string; role: string }) => void;
}

export default function Settings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'profile';

  const handleTabChange = (tabName: string) => {
    setSearchParams({ tab: tabName });
  };

  const { user, login } = useAuth();
  const outletCtx = useOutletContext<OutletContextType>();
  const { limits, plan } = usePlanLimits();
  const maxCompetitors = limits?.maxCompetitors ?? 5;

  // --- Category Options State ---
  const [categoriesList, setCategoriesList] = useState<string[]>(FALLBACK_CATEGORIES);

  // --- Profile State ---
  const [fullName, setFullName] = useState(user?.name || '');
  const [email] = useState(user?.email || '');
  const [phone, setPhone] = useState('');
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // --- Password State ---
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // --- Brand State ---
  const initialBrands = (outletCtx?.brands as BrandData[]) || [];
  const [brands, setBrands] = useState<BrandData[]>(initialBrands);
  const [selectedBrandId, setSelectedBrandId] = useState<string>(outletCtx?.currentBrand?._id || (initialBrands[0]?._id || ''));
  const [brandName, setBrandName] = useState('');
  const [brandWebsite, setBrandWebsite] = useState('');
  const [brandCategory, setBrandCategory] = useState('Skincare & Personal Care');
  const [brandBusinessType, setBrandBusinessType] = useState('ecommerce');
  const [brandRegion, setBrandRegion] = useState('India');
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [competitorInput, setCompetitorInput] = useState('');
  const [competitorError, setCompetitorError] = useState('');
  const [queries, setQueries] = useState<QueryItem[]>([]);
  const [queryInput, setQueryInput] = useState('');
  const [queryError, setQueryError] = useState('');
  const [isScanningQueries, setIsScanningQueries] = useState(false);
  const [queryScanMessage, setQueryScanMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const maxQueries = limits?.maxQueries ?? 15;
  const [brandMessage, setBrandMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSavingBrand, setIsSavingBrand] = useState(false);
  const [isDeletingBrand, setIsDeletingBrand] = useState(false);

  // --- Interactive UI Settings State ---
  const [scanFrequency, setScanFrequency] = useState('Daily');
  const [runsPerQuery, setRunsPerQuery] = useState('3 runs');
  const [digestEmail, setDigestEmail] = useState(user?.email || '');
  const [isWhatsappConnected, setIsWhatsappConnected] = useState(false);

  // Load initial user & brand data
  useEffect(() => {
    const loadData = async () => {
      try {
        const userRes = await api.get('/self-identification');
        const userData = userRes.data?.data;
        if (userData) {
          setFullName(userData.name || '');
          setDigestEmail(userData.email || '');
          if (userData.phone?.internationalNumber) {
            setPhone(userData.phone.internationalNumber);
          }
        }
      } catch (err) {
        console.error('Failed to load user profile', err);
      }

      try {
        const catRes = await api.get('/categories');
        const fetchedCats = catRes.data?.data?.categories || catRes.data?.categories || [];
        if (Array.isArray(fetchedCats) && fetchedCats.length > 0) {
          const names = fetchedCats.map((c: any) => (typeof c === 'string' ? c : c.name)).filter(Boolean);
          if (names.length > 0) {
            setCategoriesList(names);
          }
        }
      } catch (err) {
        console.error('Failed to load categories', err);
      }

      try {
        const brandsRes = await api.get('/orgs/brands');
        const list: BrandData[] = brandsRes.data?.data?.brands || (outletCtx?.brands as BrandData[]) || [];
        setBrands(list);
        if (list.length > 0) {
          const currentId = outletCtx?.currentBrand?._id;
          const match = list.find((b) => b._id === currentId || b.name === outletCtx?.currentBrand?.name) || list[0];
          populateBrandForm(match);
        }
      } catch (err) {
        console.error('Failed to load brands', err);
        if (outletCtx?.brands && outletCtx.brands.length > 0) {
          const list = outletCtx.brands as BrandData[];
          setBrands(list);
          const match = list.find((b) => b._id === outletCtx?.currentBrand?._id) || list[0];
          populateBrandForm(match);
        }
      }
    };

    loadData();
  }, [outletCtx?.currentBrand?._id, outletCtx?.brands]);

  const populateBrandForm = (b: BrandData) => {
    setSelectedBrandId(b._id);
    setBrandName(b.name || '');
    setBrandWebsite(b.website || '');
    setBrandCategory(b.category || 'Skincare & Personal Care');
    setBrandBusinessType(b.businessType || 'ecommerce');
    setBrandRegion(b.region || 'India');
    setCompetitors(b.competitors || []);
    setQueries(b.queries || []);
  };

  const handleBrandSelect = (brandId: string) => {
    const target = brands.find((b) => b._id === brandId);
    if (target) {
      populateBrandForm(target);
      setBrandMessage(null);

      // Persist selection to localStorage
      localStorage.setItem('selectedBrandId', target._id);

      if (outletCtx?.setCurrentBrand) {
        outletCtx.setCurrentBrand({ _id: target._id, name: target.name, role: target.role || 'Owner' });
      }
    }
  };

  const getUserInitials = (name?: string) => {
    if (!name) return 'AK';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // Profile submission
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMessage(null);
    if (!fullName.trim()) {
      setProfileMessage({ type: 'error', text: 'Full name cannot be empty.' });
      return;
    }
    setIsUpdatingProfile(true);
    try {
      const res = await api.put('/update-profile', {
        name: fullName.trim(),
        phone: phone.trim()
      });
      const updated = res.data?.data;
      if (updated) {
        login(localStorage.getItem('token') || '', updated);
      }
      setProfileMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to update profile.';
      setProfileMessage({ type: 'error', text: msg });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // Password change submission
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);
    if (!oldPassword || !newPassword) {
      setPasswordMessage({ type: 'error', text: 'Please fill in password fields.' });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMessage({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    setIsChangingPassword(true);
    try {
      await api.put('/change-password', { oldPassword, newPassword });
      setPasswordMessage({ type: 'success', text: 'Password changed successfully!' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to change password.';
      setPasswordMessage({ type: 'error', text: msg });
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Competitor validation helper
  const normalizeWebsite = (url: string) => {
    let clean = url.trim().toLowerCase();
    clean = clean.replace(/^(https?:\/\/)?(www\.)?/, '');
    clean = clean.replace(/\/$/, '');
    return clean.split('/')[0].split('?')[0];
  };

  const isSelfBrandOrWebsite = (nameOrUrl: string) => {
    const trimmed = nameOrUrl.trim().toLowerCase();
    if (!trimmed) return { isSelf: false, error: '' };

    const cleanBrandName = brandName.trim().toLowerCase();
    const cleanBrandWeb = normalizeWebsite(brandWebsite);
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
        error: `You cannot add your brand's website ("${brandWebsite}") as a competitor.`
      };
    }

    return { isSelf: false, error: '' };
  };

  // Competitor handlers
  const handleAddCompetitor = () => {
    setCompetitorError('');
    const trimmed = competitorInput.trim();
    if (!trimmed) return;

    if (competitors.length >= maxCompetitors) {
      setCompetitorError(`Your ${plan.toUpperCase()} plan allows maximum ${maxCompetitors} competitors. Upgrade plan to add more.`);
      return;
    }

    const { isSelf, error } = isSelfBrandOrWebsite(trimmed);
    if (isSelf) {
      setCompetitorError(error);
      return;
    }

    if (competitors.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setCompetitorError(`"${trimmed}" is already in your competitor list.`);
      return;
    }

    setCompetitors([...competitors, { name: trimmed }]);
    setCompetitorInput('');
  };

  const handleRemoveCompetitor = (idx: number) => {
    setCompetitorError('');
    setCompetitors(competitors.filter((_, i) => i !== idx));
  };

  // --- Query Handlers ---
  const handleAddQuery = () => {
    setQueryError('');
    const trimmed = queryInput.trim();
    if (!trimmed) return;

    if (queries.length >= maxQueries) {
      setQueryError(`Your ${plan.toUpperCase()} plan allows maximum ${maxQueries} queries. Upgrade plan to add more.`);
      return;
    }

    if (queries.some((q) => q.text.toLowerCase() === trimmed.toLowerCase())) {
      setQueryError(`"${trimmed}" is already in your query list.`);
      return;
    }

    setQueries([...queries, { text: trimmed, enabled: true, lang: 'EN', intent: 'Direct' }]);
    setQueryInput('');
  };

  const handleRemoveQuery = (idx: number) => {
    setQueryError('');
    setQueries(queries.filter((_, i) => i !== idx));
  };

  const handleToggleQuery = (idx: number) => {
    setQueries(queries.map((q, i) => (i === idx ? { ...q, enabled: q.enabled === false ? true : false } : q)));
  };

  const handleGenerateQueries = () => {
    setQueryError('');
    const generated = generateCategoryQueries(brandCategory, brandName);
    const existingTexts = new Set(queries.map((q) => q.text.toLowerCase()));
    const newQueriesToAdd = generated.filter((g) => !existingTexts.has(g.text.toLowerCase()));

    if (newQueriesToAdd.length === 0) {
      setQueryError('All category suggestions are already added.');
      return;
    }

    const availableSlots = maxQueries - queries.length;
    if (availableSlots <= 0) {
      setQueryError(`Query limit reached (${maxQueries}/${maxQueries}). Upgrade plan to add more.`);
      return;
    }

    const queriesToAdd = newQueriesToAdd.slice(0, availableSlots);
    setQueries([...queries, ...queriesToAdd]);
  };

  const handleRunAiQueryScan = async () => {
    if (!selectedBrandId || isScanningQueries) return;
    setIsScanningQueries(true);
    setQueryScanMessage(null);

    try {
      // First save current brand & queries
      await api.patch(`/brands/${selectedBrandId}`, {
        name: brandName.trim(),
        website: brandWebsite.trim(),
        category: brandCategory,
        region: brandRegion,
        competitors,
        queries
      });

      // Run AI query scan
      await api.post(`/brands/${selectedBrandId}/mentions/rescan`);
      setQueryScanMessage({ type: 'success', text: 'AI Query scan completed successfully! Mentions updated.' });
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to run AI query scan.';
      setQueryScanMessage({ type: 'error', text: msg });
    } finally {
      setIsScanningQueries(false);
    }
  };

  // Save Brand settings
  const handleSaveBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    setBrandMessage(null);
    if (!selectedBrandId) {
      setBrandMessage({ type: 'error', text: 'No brand selected to update.' });
      return;
    }
    setIsSavingBrand(true);
    try {
      const res = await api.patch(`/brands/${selectedBrandId}`, {
        name: brandName.trim(),
        website: brandWebsite.trim(),
        category: brandCategory,
        businessType: brandBusinessType,
        region: brandRegion,
        competitors,
        queries
      });

      const updatedBrand = res.data?.data;
      setBrands((prev) => prev.map((b) => (b._id === selectedBrandId ? updatedBrand : b)));
      setBrandMessage({ type: 'success', text: 'Brand profile updated successfully!' });
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to save brand settings.';
      setBrandMessage({ type: 'error', text: msg });
    } finally {
      setIsSavingBrand(false);
    }
  };

  // Delete Brand
  const handleDeleteBrand = async () => {
    if (!selectedBrandId) return;
    if (!window.confirm(`Remove brand "${brandName}" and all its scan history? This action cannot be undone.`)) {
      return;
    }
    setIsDeletingBrand(true);
    try {
      await api.delete(`/brands/${selectedBrandId}`);
      const remaining = brands.filter((b) => b._id !== selectedBrandId);
      setBrands(remaining);
      if (remaining.length > 0) {
        populateBrandForm(remaining[0]);
      } else {
        navigate('/onboarding');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to delete brand.';
      alert(msg);
    } finally {
      setIsDeletingBrand(false);
    }
  };

  return (
    <div style={{ maxWidth: '920px', margin: '0 auto' }}>

      {/* Settings Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '10px',
          borderBottom: '1px solid var(--line)',
          marginBottom: '24px',
          paddingBottom: '12px'
        }}
      >
        <button
          type="button"
          onClick={() => handleTabChange('profile')}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            border: activeTab === 'profile' ? '1px solid var(--primary)' : '1px solid var(--line)',
            background: activeTab === 'profile' ? 'rgba(99, 102, 241, 0.15)' : 'var(--ink-2)',
            color: activeTab === 'profile' ? 'var(--primary)' : 'var(--text-dim)',
            transition: 'all 0.2s ease'
          }}
        >
          👤 Profile & Security
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('brand')}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            border: activeTab === 'brand' ? '1px solid var(--primary)' : '1px solid var(--line)',
            background: activeTab === 'brand' ? 'rgba(99, 102, 241, 0.15)' : 'var(--ink-2)',
            color: activeTab === 'brand' ? 'var(--primary)' : 'var(--text-dim)',
            transition: 'all 0.2s ease'
          }}
        >
          🏢 Brand Settings
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('preferences')}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            border: activeTab === 'preferences' ? '1px solid var(--primary)' : '1px solid var(--line)',
            background: activeTab === 'preferences' ? 'rgba(99, 102, 241, 0.15)' : 'var(--ink-2)',
            color: activeTab === 'preferences' ? 'var(--primary)' : 'var(--text-dim)',
            transition: 'all 0.2s ease'
          }}
        >
          ⚙ Scan & Notifications
        </button>
        <button
          type="button"
          onClick={() => navigate('/billing')}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            border: '1px solid #f59e0b',
            background: 'rgba(245, 158, 11, 0.15)',
            color: '#f59e0b',
            transition: 'all 0.2s ease'
          }}
        >
          💳 Billing & Subscriptions
        </button>
      </div>

      {/* --- TAB 1: PROFILE & SECURITY --- */}
      {activeTab === 'profile' && (
        <>
          {/* 1. YOUR PROFILE PANEL */}
          <div className="panel" id="profile-settings-panel">
            <h3>Your profile</h3>
            <p className="sub">Personal account details — separate from your brand's public info</p>

            {profileMessage && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  marginBottom: '16px',
                  background: profileMessage.type === 'success' ? 'rgba(74,222,128,0.13)' : '#fee2e2',
                  color: profileMessage.type === 'success' ? 'var(--good)' : '#ef4444',
                  border: `1px solid ${profileMessage.type === 'success' ? 'var(--good)' : '#fca5a5'}`
                }}
              >
                {profileMessage.text}
              </div>
            )}

            <form onSubmit={handleProfileSubmit}>
              <div className="avatar-edit-row" style={{ display: 'flex', alignItems: 'center', gap: '18px', marginBottom: '22px' }}>
                <div className="avatar avatar-lg" style={{ width: '68px', height: '68px', fontSize: '24px' }}>
                  {getUserInitials(fullName)}
                </div>
                <div className="avatar-btns" style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="btn">Upload photo</button>
                  <button type="button" className="btn btn-ghost">Remove</button>
                </div>
              </div>

              <div className="onb-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="field">
                  <label>Full name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input type="email" value={email} disabled style={{ opacity: 0.7, cursor: 'not-allowed' }} />
                </div>
              </div>

              <div className="onb-actions" style={{ borderTop: 'none', paddingTop: '12px', marginTop: 0, justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" disabled={isUpdatingProfile}>
                  {isUpdatingProfile ? 'Saving profile...' : 'Save profile'}
                </button>
              </div>
            </form>
          </div>

          {/* 2. CHANGE PASSWORD PANEL */}
          <div className="panel">
            <h3>Security & Password</h3>
            <p className="sub">Update your account password</p>

            {passwordMessage && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  marginBottom: '16px',
                  background: passwordMessage.type === 'success' ? 'rgba(74,222,128,0.13)' : '#fee2e2',
                  color: passwordMessage.type === 'success' ? 'var(--good)' : '#ef4444',
                  border: `1px solid ${passwordMessage.type === 'success' ? 'var(--good)' : '#fca5a5'}`
                }}
              >
                {passwordMessage.text}
              </div>
            )}

            <form onSubmit={handlePasswordSubmit}>
              <div className="field" style={{ marginBottom: '14px' }}>
                <label>Current password</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="••••••••••"
                />
              </div>
              <div className="onb-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="field">
                  <label>New password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Leave blank to keep current"
                  />
                </div>
                <div className="field">
                  <label>Confirm new password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••"
                  />
                </div>
              </div>
              <div className="onb-actions" style={{ borderTop: 'none', paddingTop: '12px', marginTop: 0, justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" disabled={isChangingPassword}>
                  {isChangingPassword ? 'Updating password...' : 'Update password'}
                </button>
              </div>
            </form>
          </div>

          {/* 3. PLAN & BILLING PANEL */}
          <div className="panel">
            <h3>Plan & billing</h3>
            <p className="sub">Starter plan · 8 queries tracked · renews monthly</p>
            <div className="onb-actions" style={{ borderTop: 'none', paddingTop: '6px', marginTop: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="mono" style={{ color: 'var(--text-dim)', fontSize: '12.5px' }}>Next invoice on the 4th</span>
              <button type="button" className="btn" onClick={() => navigate('/pricing')}>Manage plan</button>
            </div>
          </div>
        </>
      )}

      {/* --- TAB 2: BRAND SETTINGS --- */}
      {activeTab === 'brand' && (
        <>
          {/* Brand Switcher Bar in Settings */}
          <div className="panel" style={{ padding: '16px 20px', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dim)' }}>Configuring brand:</span>
                {brands.length > 0 ? (
                  <select
                    value={selectedBrandId}
                    onChange={(e) => handleBrandSelect(e.target.value)}
                    style={{
                      background: 'var(--ink-2)',
                      border: '1px solid var(--line)',
                      color: 'var(--text)',
                      padding: '8px 14px',
                      borderRadius: '6px',
                      fontSize: '13px'
                    }}
                  >
                    {brands.map((b) => (
                      <option key={b._id} value={b._id}>
                        {b.name} ({b.category || 'General'})
                      </option>
                    ))}
                  </select>
                ) : (
                  <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>No brands found</span>
                )}
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate('/onboarding')}
                style={{ fontSize: '13px', padding: '6px 14px' }}
              >
                + Add new brand
              </button>
            </div>
          </div>

          {/* BRAND PROFILE PANEL */}
          <div className="panel">
            <h3>Brand profile</h3>
            <p className="sub">Basic details Signal uses to match mentions</p>

            {brandMessage && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  marginBottom: '16px',
                  background: brandMessage.type === 'success' ? 'rgba(74,222,128,0.13)' : '#fee2e2',
                  color: brandMessage.type === 'success' ? 'var(--good)' : '#ef4444',
                  border: `1px solid ${brandMessage.type === 'success' ? 'var(--good)' : '#fca5a5'}`
                }}
              >
                {brandMessage.text}
              </div>
            )}

            <form onSubmit={handleSaveBrand}>
              <div className="onb-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div className="field">
                  <label>Brand name</label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Website</label>
                  <input
                    type="text"
                    value={brandWebsite}
                    onChange={(e) => setBrandWebsite(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Category</label>
                  <select
                    value={brandCategory}
                    onChange={(e) => setBrandCategory(e.target.value)}
                  >
                    {categoriesList.map((catName) => (
                      <option key={catName} value={catName}>
                        {catName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Business Niche / Type</label>
                  <select
                    value={brandBusinessType}
                    onChange={(e) => setBrandBusinessType(e.target.value)}
                  >
                    <option value="saas">💼 B2B / SaaS / Software</option>
                    <option value="ecommerce">🛒 E-Commerce & Retail Store</option>
                    <option value="service">🏥 Professional Service / Agency</option>
                    <option value="local_business">📍 Local Business & Storefront</option>
                    <option value="content_media">📰 Blog / Media / Content Platform</option>
                  </select>
                </div>
                <div className="field">
                  <label>Primary market</label>
                  <select
                    value={brandRegion}
                    onChange={(e) => setBrandRegion(e.target.value)}
                  >
                    <option value="India">India</option>
                    <option value="India + Global">India + Global</option>
                    <option value="United States">United States</option>
                    <option value="Global">Global</option>
                  </select>
                </div>
              </div>
              <div className="onb-actions" style={{ borderTop: 'none', paddingTop: '6px', marginTop: '6px', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn-primary" disabled={isSavingBrand}>
                  {isSavingBrand ? 'Saving changes...' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>

          {/* COMPETITORS TRACKED PANEL */}
          <div className="panel">
            <h3>Competitors tracked</h3>
            <p className="sub">Add or remove who Signal compares you against</p>

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

            <div className="chip-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', margin: '14px 0' }}>
              {competitors.length === 0 ? (
                <span className="sub" style={{ fontSize: '12.5px', marginBottom: 0 }}>
                  No competitors added yet.
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

            <div className="add-row" style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                placeholder={
                  competitors.length >= maxCompetitors
                    ? `Limit reached (${maxCompetitors}/${maxCompetitors} competitors). Upgrade plan to add more.`
                    : "Add a competitor name…"
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

            {competitorError && (
              <p className="error-text" style={{ marginTop: '10px', color: '#ef4444' }}>
                {competitorError}
              </p>
            )}
          </div>

          {/* TRACKED QUERIES PANEL */}
          <div className="panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3>Tracked queries</h3>
                <p className="sub">Manage and scan AI queries Signal tracks for your brand</p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={isScanningQueries}
                onClick={handleRunAiQueryScan}
                style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <span className={`rescan-icon ${isScanningQueries ? 'spinning' : ''}`} style={{ fontSize: '14px' }}>
                  ⚙
                </span>
                {isScanningQueries ? 'Scanning AI Queries...' : 'Run AI Query Scan'}
              </button>
            </div>

            {queryScanMessage && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  margin: '12px 0',
                  background: queryScanMessage.type === 'success' ? 'rgba(74,222,128,0.13)' : '#fee2e2',
                  color: queryScanMessage.type === 'success' ? 'var(--good)' : '#ef4444',
                  border: `1px solid ${queryScanMessage.type === 'success' ? 'var(--good)' : '#fca5a5'}`
                }}
              >
                {queryScanMessage.text}
              </div>
            )}

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
                <strong>Plan Allowance:</strong> {queries.length} / {maxQueries === Infinity ? 'Unlimited' : maxQueries} queries tracked
                <span style={{ color: 'var(--text-dim)', marginLeft: '6px', fontSize: '11px', textTransform: 'uppercase' }}>({plan} plan)</span>
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: '12px', padding: '4px 10px' }}
                onClick={handleGenerateQueries}
              >
                + Auto-suggest {brandCategory} queries
              </button>
            </div>

            {/* Queries List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', margin: '14px 0' }}>
              {queries.length === 0 ? (
                <p className="sub" style={{ fontSize: '12.5px', marginBottom: 0 }}>
                  No queries added yet. Type a query below or click "+ Auto-suggest" to get started.
                </p>
              ) : (
                queries.map((q, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: 'var(--ink-2)',
                      border: '1px solid var(--line-soft)',
                      borderRadius: '8px',
                      opacity: q.enabled === false ? 0.5 : 1
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={q.enabled !== false}
                        onChange={() => handleToggleQuery(idx)}
                        style={{ cursor: 'pointer' }}
                        title={q.enabled !== false ? 'Enabled for scanning' : 'Disabled'}
                      />
                      <span style={{ fontSize: '13.5px', color: 'var(--text)' }}>{q.text}</span>
                      {q.lang && (
                        <span style={{ fontSize: '10.5px', padding: '2px 6px', borderRadius: '4px', background: 'var(--panel-bg)', color: 'var(--text-dim)', border: '1px solid var(--border-color)' }}>
                          {q.lang}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveQuery(idx)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-dim)',
                        fontSize: '16px',
                        cursor: 'pointer',
                        padding: '0 4px'
                      }}
                      title="Remove query"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="add-row" style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                placeholder={
                  queries.length >= maxQueries
                    ? `Query limit reached (${maxQueries}/${maxQueries}). Upgrade plan to add more.`
                    : "Add a custom query (e.g. Best skincare product for dry skin)..."
                }
                value={queryInput}
                disabled={queries.length >= maxQueries}
                onChange={(e) => setQueryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddQuery();
                  }
                }}
              />
              <button
                type="button"
                className="btn"
                disabled={queries.length >= maxQueries}
                onClick={handleAddQuery}
              >
                Add query
              </button>
            </div>

            {queryError && (
              <p className="error-text" style={{ marginTop: '10px', color: '#ef4444' }}>
                {queryError}
              </p>
            )}
          </div>

          {/* MODELS & PLATFORMS TRACKED PANEL */}
          <div className="panel">
            <h3>Models & platforms tracked</h3>
            <p className="sub">Turn providers on or off for this brand</p>
            <div className="audit-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="audit-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: 'var(--ink-2)', border: '1px solid var(--line-soft)', borderRadius: '8px' }}>
                <span className="name">
                  <span className="model-dot" style={{ background: 'var(--claude)', display: 'inline-block', marginRight: '8px', width: '7px', height: '7px', borderRadius: '50%' }}></span>
                  Claude
                </span>
                <span className="badge badge-ok">On</span>
              </div>
              <div className="audit-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: 'var(--ink-2)', border: '1px solid var(--line-soft)', borderRadius: '8px' }}>
                <span className="name">
                  <span className="model-dot" style={{ background: 'var(--gpt)', display: 'inline-block', marginRight: '8px', width: '7px', height: '7px', borderRadius: '50%' }}></span>
                  GPT
                </span>
                <span className="badge badge-ok">On</span>
              </div>
              <div className="audit-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: 'var(--ink-2)', border: '1px solid var(--line-soft)', borderRadius: '8px' }}>
                <span className="name">
                  <span className="model-dot" style={{ background: 'var(--gemini)', display: 'inline-block', marginRight: '8px', width: '7px', height: '7px', borderRadius: '50%' }}></span>
                  Gemini
                </span>
                <span className="badge badge-ok">On</span>
              </div>
              <div className="audit-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: 'var(--ink-2)', border: '1px solid var(--line-soft)', borderRadius: '8px' }}>
                <span className="name">Google AI Overview</span>
                <span className="badge badge-ok">On</span>
              </div>
              <div className="audit-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: 'var(--ink-2)', border: '1px solid var(--line-soft)', borderRadius: '8px' }}>
                <span className="name">Meta AI (WhatsApp/Instagram)</span>
                <span className="badge badge-warn">Upgrade to enable</span>
              </div>
              <div className="audit-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: 'var(--ink-2)', border: '1px solid var(--line-soft)', borderRadius: '8px' }}>
                <span className="name">Perplexity</span>
                <span className="badge badge-warn">Upgrade to enable</span>
              </div>
            </div>
          </div>

          {/* LANGUAGE & REGION PANEL */}
          <div className="panel">
            <h3>Language & region</h3>
            <p className="sub">Track queries the way Indian customers actually type them — not just English</p>
            <div className="audit-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="audit-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: 'var(--ink-2)', border: '1px solid var(--line-soft)', borderRadius: '8px' }}>
                <span className="name">English queries</span>
                <span className="badge badge-ok">On</span>
              </div>
              <div className="audit-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: 'var(--ink-2)', border: '1px solid var(--line-soft)', borderRadius: '8px' }}>
                <span className="name">Hinglish queries</span>
                <span className="badge badge-ok">On</span>
              </div>
              <div className="audit-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: 'var(--ink-2)', border: '1px solid var(--line-soft)', borderRadius: '8px' }}>
                <span className="name">Hindi (Devanagari) queries</span>
                <span className="badge badge-warn">Upgrade to enable</span>
              </div>
              <div className="audit-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: 'var(--ink-2)', border: '1px solid var(--line-soft)', borderRadius: '8px' }}>
                <span className="name">Tamil / Bengali queries</span>
                <span className="badge badge-warn">Upgrade to enable</span>
              </div>
            </div>
          </div>

          {/* DANGER ZONE PANEL */}
          <div className="panel" style={{ borderColor: 'rgba(248,113,113,0.3)' }}>
            <h3 style={{ color: 'var(--bad)' }}>Danger zone</h3>
            <p className="sub">Remove this brand and all its scan history — this can't be undone.</p>
            <button
              type="button"
              className="btn"
              onClick={handleDeleteBrand}
              disabled={isDeletingBrand}
              style={{ borderColor: 'rgba(248,113,113,0.4)', color: 'var(--bad)' }}
            >
              {isDeletingBrand ? 'Deleting brand...' : 'Delete brand'}
            </button>
          </div>
        </>
      )}

      {/* --- TAB 3: SCAN & NOTIFICATIONS --- */}
      {activeTab === 'preferences' && (
        <>
          {/* SCAN SCHEDULE PANEL */}
          <div className="panel">
            <h3>Scan schedule</h3>
            <p className="sub">How often Signal re-runs your tracked queries</p>
            <div className="audit-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="audit-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: 'var(--ink-2)', border: '1px solid var(--line-soft)', borderRadius: '8px' }}>
                <span className="name">Scan frequency</span>
                <select
                  value={scanFrequency}
                  onChange={(e) => setScanFrequency(e.target.value)}
                  style={{ width: 'auto', padding: '6px 10px', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: '6px' }}
                >
                  <option value="Weekly">Weekly</option>
                  <option value="Daily">Daily</option>
                  <option value="Monthly">Monthly</option>
                </select>
              </div>
              <div className="audit-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: 'var(--ink-2)', border: '1px solid var(--line-soft)', borderRadius: '8px' }}>
                <span className="name">Runs per query per model</span>
                <select
                  value={runsPerQuery}
                  onChange={(e) => setRunsPerQuery(e.target.value)}
                  style={{ width: 'auto', padding: '6px 10px', background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: '6px' }}
                >
                  <option value="1 run">1 run</option>
                  <option value="3 runs">3 runs</option>
                  <option value="5 runs">5 runs</option>
                </select>
              </div>
            </div>
          </div>

          {/* NOTIFICATIONS PANEL */}
          <div className="panel">
            <h3>Notifications</h3>
            <p className="sub">Where Signal sends your weekly digest and alerts</p>
            <div className="field" style={{ marginBottom: '14px' }}>
              <label>Digest email</label>
              <input
                type="email"
                value={digestEmail}
                onChange={(e) => setDigestEmail(e.target.value)}
              />
            </div>
            <div className="audit-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: 'var(--ink-2)', border: '1px solid var(--line-soft)', borderRadius: '8px', marginBottom: '8px' }}>
              <span className="name">Score drop / spike alerts</span>
              <span className="badge badge-ok">Enabled</span>
            </div>
            <div className="audit-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', background: 'var(--ink-2)', border: '1px solid var(--line-soft)', borderRadius: '8px' }}>
              <span className="name">WhatsApp digest — reply to mark recommendations done</span>
              <button
                type="button"
                className={`btn connect-btn ${isWhatsappConnected ? 'connected' : ''}`}
                onClick={() => setIsWhatsappConnected(!isWhatsappConnected)}
                style={{ fontSize: '11.5px', padding: '5px 12px' }}
              >
                {isWhatsappConnected ? 'Connected ✓' : 'Connect'}
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
