import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function PublicRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    const target = sessionStorage.getItem('post_auth_redirect') || '/';
    sessionStorage.removeItem('post_auth_redirect');
    return <Navigate to={target} replace />;
  }

  return <Outlet />;
}
