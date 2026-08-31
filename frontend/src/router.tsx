import { createBrowserRouter } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import Overview from './pages/Overview';
import Mentions from './pages/Mentions';
import Competitors from './pages/Competitors';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Onboarding from './pages/Onboarding';
import Settings from './pages/Settings';
import Workspace from './pages/Workspace';
import EmailConfirmation from './pages/EmailConfirmation';
import ProtectedRoute from './components/ProtectedRoute';
import PublicRoute from './components/PublicRoute';
import WebsiteAudit from './pages/WebsiteAudit';
import Recommendations from './pages/Recommendations';
import Reports from './pages/Reports';
import Pricing from './pages/Pricing';
import Billing from './pages/Billing';
import FreeVisibilityChecker from './pages/FreeVisibilityChecker';
import AdminRoute from './components/AdminRoute';
import AdminLayout from './components/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminModels from './pages/admin/AdminModels';
import AdminCategories from './pages/admin/AdminCategories';
import AdminCostLogs from './pages/admin/AdminCostLogs';
import AdminApiKeys from './pages/admin/AdminApiKeys';
import AdminBilling from './pages/admin/AdminBilling';

export const router = createBrowserRouter([
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/workspace',
        element: <Workspace />,
      },
      {
        path: '/onboarding',
        element: <Onboarding />,
      },
      {
        path: '/',
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: <Overview />,
          },
          {
            path: 'mentions',
            element: <Mentions />,
          },
          {
            path: 'competitors',
            element: <Competitors />,
          },
          {
            path: 'audit',
            element: <WebsiteAudit />,
          },
          {
            path: 'recommendations',
            element: <Recommendations />,
          },
          {
            path: 'reports',
            element: <Reports />,
          },
          {
            path: 'settings',
            element: <Settings />,
          },
          {
            path: 'pricing',
            element: <Pricing />,
          },
          {
            path: 'billing',
            element: <Billing />,
          },
        ],
      },
      {
        path: '/admin',
        element: <AdminRoute />,
        children: [
          {
            element: <AdminLayout />,
            children: [
              {
                index: true,
                element: <AdminDashboard />,
              },
              {
                path: 'users',
                element: <AdminUsers />,
              },
              {
                path: 'billing',
                element: <AdminBilling />,
              },
              {
                path: 'ai-models',
                element: <AdminModels />,
              },
              {
                path: 'api-keys',
                element: <AdminApiKeys />,
              },
              {
                path: 'categories',
                element: <AdminCategories />,
              },
              {
                path: 'cost-logs',
                element: <AdminCostLogs />,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    element: <PublicRoute />,
    children: [
      {
        path: '/login',
        element: <Login />,
      },
      {
        path: '/signup',
        element: <Signup />,
      },
      {
        path: '/free-checker',
        element: <FreeVisibilityChecker />,
      },
      {
        path: '/confirmation/:token',
        element: <EmailConfirmation />,
      },
    ],
  },
]);

