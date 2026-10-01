import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function PublicRoute() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    // This redirect fires as soon as login() sets the session, before Login's own navigate() runs,
    // so it decides where people land: admins go to the admin portal (they may have no brand)
    const target = sessionStorage.getItem('post_auth_redirect') || (user?.role === 'admin' ? '/admin' : '/');
    sessionStorage.removeItem('post_auth_redirect');
    return <Navigate to={target} replace />;
  }

  return <Outlet />;
}
