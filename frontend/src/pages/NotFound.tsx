import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Unknown address or a page that crashed: a plain page with a way back, not the router's developer error
export default function NotFound() {
  const { isAuthenticated } = useAuth();
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', background: 'var(--bg-dark)', color: 'var(--text-main)' }}>
      <div style={{ maxWidth: '420px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '22px', margin: '0 0 8px' }}>Page not found</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-faint)', margin: '0 0 20px' }}>
          This page doesn't exist or couldn't load. Check the address, or go back to your dashboard.
        </p>
        <Link to={isAuthenticated ? '/' : '/login'} className="btn btn-primary">
          {isAuthenticated ? 'Go to Overview' : 'Log in'}
        </Link>
      </div>
    </div>
  );
}
