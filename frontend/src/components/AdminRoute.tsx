import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AdminRoute() {
  const { isAuthenticated, user, isLoading } = useAuth();

  if (isLoading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.role !== 'admin') {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <h2 style={{ fontSize: '24px', color: '#E63946', marginBottom: '12px' }}>Access Restricted</h2>
        <p style={{ color: '#888', marginBottom: '24px' }}>
          You do not have administrator permissions to access this page. If you are an admin, please verify your account role.
        </p>
        <a 
          href="/" 
          style={{ 
            display: 'inline-block',
            padding: '10px 20px', 
            background: 'var(--primary-color, #4F46E5)', 
            color: '#fff', 
            borderRadius: '6px',
            textDecoration: 'none'
          }}
        >
          Return to Dashboard
        </a>
      </div>
    );
  }

  return <Outlet />;
}
