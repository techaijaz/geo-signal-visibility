import { useState, useEffect } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import Footer from './Footer';
import api from '../utils/axios';

export default function AppLayout() {
  const [brands, setBrands] = useState<Array<{ _id?: string; name: string; role?: string }>>([]);
  const [currentBrand, setCurrentBrand] = useState<{ _id?: string; name: string; role: string }>({ _id: '', name: '', role: 'Owner' });
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [shouldRedirectToOnboarding, setShouldRedirectToOnboarding] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let isMounted = true;
    const fetchBrands = async () => {
      try {
        const res = await api.get('/orgs/brands');
        const fetchedBrands: Array<{ _id?: string; name: string; role?: string }> = res.data?.data?.brands || [];
        if (isMounted) {
          if (fetchedBrands.length === 0) {
            setShouldRedirectToOnboarding(true);
          } else {
            // Deduplicate brands by _id to prevent duplicates in state/UI dropdown
            const uniqueBrands = fetchedBrands.filter(
              (brand, index, self) => index === self.findIndex((b) => b._id === brand._id)
            );
            setBrands(uniqueBrands);

            // Check localStorage for previously selected brand
            const savedBrandId = localStorage.getItem('selectedBrandId');
            let selectedBrand = uniqueBrands[0]; // fallback to first brand

            if (savedBrandId) {
              const match = uniqueBrands.find((b) => b._id === savedBrandId);
              if (match) {
                selectedBrand = match;
              }
            }


            setCurrentBrand({
              _id: selectedBrand._id,
              name: selectedBrand.name,
              role: selectedBrand.role || 'Owner'
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch brands', err);
      } finally {
        if (isMounted) setLoadingBrands(false);
      }
    };

    fetchBrands();

    return () => { isMounted = false; };
  }, []);

  const navItems = [
    { path: '/', label: 'Overview', icon: '◆' },
    { path: '/mentions', label: 'Mentions', icon: '▤' },
    { path: '/competitors', label: 'Competitors', icon: '▦' },
    { path: '/audit', label: 'Website audit', icon: '⚙' },
    { path: '/recommendations', label: 'Recommendations', icon: '✓' },
    { path: '/reports', label: 'Reports', icon: '▥' },
    { path: '/settings', label: 'Settings', icon: '⚙' },
    { path: '/billing', label: 'Billing & Plans', icon: '💳' },
  ];

  const getPageTitle = () => {
    const activeItem = navItems.find(item => item.path === location.pathname);
    return activeItem ? activeItem.label : 'Overview';
  };

  if (loadingBrands) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-dark)', color: 'var(--text-main)' }}>
        <p>Loading workspace...</p>
      </div>
    );
  }

  if (shouldRedirectToOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="app-shell">
      {/* Sidebar Component */}
      <Sidebar 
        currentBrand={currentBrand} 
        brands={brands}
        onBrandChange={(b: { name: string; role: string }) => {
          const match = brands.find(item => item.name === b.name);
          const newBrand = {
            _id: match?._id || currentBrand._id,
            name: b.name,
            role: b.role
          };

          // Persist the selection to localStorage
          if (newBrand._id) {
            localStorage.setItem('selectedBrandId', newBrand._id);
          }

          setCurrentBrand(newBrand);
        }} 
        navItems={navItems} 
      />

      {/* Main Content Area */}
      <main className="main">
        {/* Header Component */}
        <Header 
          title={getPageTitle()} 
          brandName={currentBrand.name} 
          userRole={currentBrand.role} 
        />

        {/* Page Content */}
        <Outlet context={{ currentBrand, brands, setCurrentBrand }} />

        {/* Footer Component */}
        <Footer />
      </main>
    </div>
  );
}
