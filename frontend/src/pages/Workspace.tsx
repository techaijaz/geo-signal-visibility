import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/axios';
import { useAuth } from '../context/AuthContext';
import { usePlanLimits } from '../hooks/usePlanLimits';

interface BrandItem {
  _id: string;
  name: string;
  category: string;
  role?: string;
  website?: string;
  queries?: any[];
  updatedAt?: string;
}

export default function Workspace() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { limits, plan } = usePlanLimits();
  const [brands, setBrands] = useState<BrandItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const isAgency = plan === 'agency' || limits?.features?.multiBrand;
  const canAddMoreBrands = isAgency || brands.length < (limits?.maxBrands || 1);

  useEffect(() => {
    const fetchBrands = async () => {
      try {
        const res = await api.get('/orgs/brands');
        const list = res.data?.data?.brands || [];
        setBrands(list);
      } catch (err) {
        console.error('Failed to load workspace brands', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBrands();
  }, []);

  const getUserInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const handleSelectBrand = (brand: BrandItem) => {
    // Store selected brand ID in localStorage so AppLayout can read it
    localStorage.setItem('selectedBrandId', brand._id);

    // Navigate to dashboard overview for selected brand
    navigate('/');
  };

  const handleAddBrandClick = () => {
    if (!canAddMoreBrands) {
      alert('Multi-brand feature is only available on the Agency plan. Upgrade to Agency plan to manage multiple client brands.');
      navigate('/pricing');
    } else {
      navigate('/onboarding');
    }
  };

  return (
    <div style={{ width: '100%', minHeight: '100vh', background: 'var(--ink)', color: 'var(--text)' }}>
      <div className="workspace-wrap" style={{ maxWidth: '1180px', margin: '0 auto', padding: '44px 32px' }}>
        {/* Workspace Top Bar */}
        <div className="workspace-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="brand-mark">
            <span className="dot"></span>
            <span>Signal</span>
          </div>
          <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button className="btn btn-primary" onClick={handleAddBrandClick}>
              + Add brand {!canAddMoreBrands ? '🔒' : ''}
            </button>

            <div
              className="header-user"
              style={{ position: 'relative' }}
              onClick={(e) => {
                e.stopPropagation();
                setIsUserMenuOpen(!isUserMenuOpen);
              }}
            >
              <div className="avatar">{getUserInitials(user?.name)}</div>
              <div className="header-user-info">
                <span className="name">{user?.name || 'User'}</span>
                <span className="role">Workspace Owner</span>
              </div>
              <span className="header-user-caret">▾</span>

              <div className={`header-user-menu ${isUserMenuOpen ? 'open' : ''}`} style={{ right: 0, left: 'auto' }}>
                <button onClick={(e) => { e.stopPropagation(); navigate('/settings?tab=profile'); setIsUserMenuOpen(false); }}>
                  Profile settings
                </button>
                <hr />
                <button onClick={(e) => { e.stopPropagation(); navigate('/login'); setIsUserMenuOpen(false); }}>
                  Log out
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Heading */}
        <div className="workspace-heading" style={{ marginTop: '36px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 600, margin: 0 }}>Your brands</h1>
          <p className="sub" style={{ color: 'var(--text-dim)', fontSize: '14px', margin: '6px 0 0' }}>
            Switch between brands you own, or brands you manage for clients.
          </p>
        </div>

        {/* Multi-brand upgrade banner if limit reached */}
        {!canAddMoreBrands && (
          <div style={{
            marginTop: '20px',
            padding: '14px 20px',
            background: 'rgba(255, 200, 87, 0.08)',
            border: '1px solid rgba(255, 200, 87, 0.25)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13.5px',
            color: 'var(--amber)'
          }}>
            <span>💼 <strong>Multi-brand management is exclusive to Agency plan.</strong> Upgrade to add and track additional client brands.</span>
            <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '12.5px' }} onClick={() => navigate('/pricing')}>
              Upgrade to Agency
            </button>
          </div>
        )}

        {/* Brands Grid */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-dim)' }}>
            Loading your workspace brands...
          </div>
        ) : (
          <div className="workspace-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px', marginTop: '28px' }}>
            {brands.map((brand) => {
              const isClient = brand.role === 'Client';
              const queryCount = brand.queries?.length || 8;
              return (
                <div
                  key={brand._id}
                  className="brand-card"
                  onClick={() => handleSelectBrand(brand)}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '14px',
                    padding: '24px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div className="brand-card-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div className="brand-card-name" style={{ fontSize: '16px', fontWeight: 600 }}>{brand.name}</div>
                    <span className={`tag-role ${isClient ? 'tag-client' : 'tag-owner'}`}>
                      {isClient ? 'Client' : 'Owner'}
                    </span>
                  </div>
                  <div className="brand-card-cat" style={{ fontSize: '12.5px', color: 'var(--text-faint)', marginBottom: '18px' }}>
                    {brand.category || 'General'}
                  </div>

                  <div className="brand-card-score" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '36px', fontWeight: 600, color: 'var(--amber)', lineHeight: 1 }}>
                    0
                  </div>
                  <div className="brand-card-meta" style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '12px' }}>
                    {queryCount} queries tracked
                  </div>
                </div>
              );
            })}

            {/* Add Brand Card */}
            <button
              className="brand-card add-brand-card"
              onClick={handleAddBrandClick}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                border: canAddMoreBrands ? '1px dashed var(--line)' : '1px dashed rgba(255, 200, 87, 0.4)',
                background: canAddMoreBrands ? 'transparent' : 'rgba(255, 200, 87, 0.03)',
                borderRadius: '14px',
                padding: '24px',
                minHeight: '200px',
                cursor: 'pointer',
                color: 'var(--text-dim)'
              }}
            >
              <span className="add-icon" style={{ fontSize: '28px', color: 'var(--amber)' }}>
                {canAddMoreBrands ? '+' : '🔒'}
              </span>
              <span style={{ fontWeight: 500, fontSize: '14px' }}>
                {canAddMoreBrands ? 'Add a brand' : 'Add brand (Agency plan)'}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
