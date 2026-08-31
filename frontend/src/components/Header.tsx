import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/axios';

interface HeaderProps {
  title: string;
  brandName: string;
  userRole: string;
}

export default function Header({ title, brandName, userRole }: HeaderProps) {
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isRescanning, setIsRescanning] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleRescan = async () => {
    const activeBrandId = localStorage.getItem('geo_active_brand_id');
    setIsRescanning(true);
    if (activeBrandId) {
      try {
        await api.post(`/brands/${activeBrandId}/mentions/rescan`);
      } catch (e) {
        console.error('Header rescan trigger failed:', e);
      }
    }
    setTimeout(() => setIsRescanning(false), 2000);
  };

  const handleLogout = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsUserMenuOpen(false);
    logout();
    navigate('/login');
  };

  const userName = user?.name || 'Aijaz Khan';
  const userInitials = userName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'AK';

  return (
    <header className="main-top">
      <div>
        <h1>{title}</h1>
        <div className="meta">{brandName} · Last scanned 2 hours ago</div>
      </div>

      <div className="header-right">
        <button 
          className={`btn rescan-btn ${isRescanning ? 'spinning' : ''}`}
          onClick={handleRescan}
          disabled={isRescanning}
        >
          <span className="rescan-icon">↻</span> {isRescanning ? 'Scanning...' : 'Re-scan now'}
        </button>

        {/* User Profile Dropdown */}
        <div 
          className="header-user"
          onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
        >
          <div className="avatar">{userInitials}</div>
          <div className="header-user-info">
            <span className="name">{userName}</span>
            <span className="role">{userRole}</span>
          </div>
          <span className="header-user-caret">▾</span>

          <div className={`header-user-menu ${isUserMenuOpen ? 'open' : ''}`}>
            {user?.role === 'admin' && (
              <>
                <button 
                  onClick={(e) => { e.stopPropagation(); navigate('/admin'); setIsUserMenuOpen(false); }}
                  style={{ color: 'var(--amber)', fontWeight: 600 }}
                >
                  ⚡ Admin Panel
                </button>
                <hr />
              </>
            )}
            <button onClick={(e) => { e.stopPropagation(); navigate('/settings?tab=profile'); setIsUserMenuOpen(false); }}>
              Profile settings
            </button>
            <button onClick={(e) => { e.stopPropagation(); navigate('/settings?tab=brand'); setIsUserMenuOpen(false); }}>
              Brand settings
            </button>
            <hr />
            <button onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
