import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { usePlanLimits } from '../hooks/usePlanLimits';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  currentBrand: { _id?: string; name: string; role: string };
  brands?: Array<{ _id?: string; name: string; role?: string }>;
  onBrandChange: (brand: { name: string; role: string }) => void;
  navItems: Array<{ path: string; label: string; icon: string }>;
}

export default function Sidebar({ currentBrand, brands = [], onBrandChange, navItems }: SidebarProps) {
  const [isBrandMenuOpen, setIsBrandMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { limits, plan } = usePlanLimits();
  const { user } = useAuth();

  const isAgency = plan === 'agency' || limits?.features?.multiBrand;
  const canAddMoreBrands = isAgency || brands.length < (limits?.maxBrands || 1);

  const handleAddBrandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsBrandMenuOpen(false);
    if (!canAddMoreBrands) {
      alert('Multi-brand feature is only available on the Agency plan. Upgrade to Agency plan to manage multiple brands.');
      navigate('/pricing');
    } else {
      navigate('/onboarding');
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="brand-mark" style={{ padding: '0 8px', marginBottom: '30px' }}>
          <span className="dot"></span>
          <span>Signal</span>
        </div>

        {/* Brand Switcher */}
        <div 
          className="brand-switch"
          onClick={() => setIsBrandMenuOpen(!isBrandMenuOpen)}
        >
          <div>
            <div className="brand-switch-name">{currentBrand.name || 'Select Brand'}</div>
            <div className="brand-switch-sub">{currentBrand.role}</div>
          </div>
          <span className="header-user-caret">▾</span>

          <div className={`header-user-menu brand-switch-menu ${isBrandMenuOpen ? 'open' : ''}`}>
            <button onClick={(e) => { e.stopPropagation(); navigate('/workspace'); setIsBrandMenuOpen(false); }}>
              ◂ All brands
            </button>
            <hr />
            {brands.length > 0 ? (
              brands.map((b, idx) => (
                <button
                  key={b._id || idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    onBrandChange({ name: b.name, role: b.role || 'Owner' });
                    setIsBrandMenuOpen(false);
                  }}
                >
                  {b.name} {b.role === 'Client' ? '(Client)' : ''}
                </button>
              ))
            ) : (
              <button onClick={(e) => { e.stopPropagation(); onBrandChange({ name: currentBrand.name, role: currentBrand.role }); setIsBrandMenuOpen(false); }}>
                {currentBrand.name || 'Default Brand'}
              </button>
            )}
            <hr />
            <button onClick={handleAddBrandClick}>
              + Add brand {!canAddMoreBrands ? '🔒' : ''}
            </button>
          </div>
        </div>

        {/* Navigation Links */}
        <nav>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="ic">{item.icon}</span>
              <span className="label-text">{item.label}</span>
            </NavLink>
          ))}

          {user?.role === 'admin' && (
            <NavLink
              to="/admin"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              style={{ marginTop: '16px', borderTop: '1px solid var(--line)', paddingTop: '12px', color: 'var(--amber)' }}
            >
              <span className="ic">⚡</span>
              <span className="label-text">Admin Panel</span>
            </NavLink>
          )}
        </nav>
      </div>

      <div className="sidebar-bottom">
        <div style={{ marginBottom: '6px', fontWeight: 600 }}>{currentBrand.name}</div>
        <div style={{ textTransform: 'capitalize' }}>{plan} plan</div>
      </div>
    </aside>
  );
}
