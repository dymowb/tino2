import React, { Component, ErrorInfo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import theme from './theme/theme';
import './i18n'; // Initialize i18next
import Navigation from './components/layout/Navigation';
import HomePage from './components/pages/HomePage';
import LoginForm from './components/auth/LoginForm';
import RegisterForm from './components/auth/RegisterForm';
import FindProvidersPage from './components/pages/FindProvidersPage';
import MyBookingsPage from './components/pages/MyBookingsPage';
import ProfilePage from './components/pages/ProfilePage';
import ProviderDashboardPage from './components/pages/ProviderDashboardPage';
import MessagingPage from './components/pages/MessagingPage';
import PaymentsPage from './components/pages/PaymentsPage';
import MyReviewsPage from './components/pages/MyReviewsPage';
import NotificationsPage from './components/pages/NotificationsPage';
import MyQuotesPage from './components/pages/MyQuotesPage';
import LoadingSpinner from './components/common/LoadingSpinner';
import AdminRoute from './components/auth/AdminRoute';
import VerifyEmailPage from './components/auth/VerifyEmailPage';
import ForgotPasswordPage from './components/pages/ForgotPasswordPage';
import ResetPasswordPage from './components/pages/ResetPasswordPage';
import AdminLayout from './components/admin/AdminLayout';
import AdminDashboardPage from './components/pages/AdminDashboardPage';
import AdminUsersPage from './components/pages/AdminUsersPage';
import AdminProvidersPage from './components/pages/AdminProvidersPage';
import AdminReviewsPage from './components/pages/AdminReviewsPage';
import AdminSettingsPage from './components/pages/AdminSettingsPage';
import AdminDisputesPage from './components/pages/AdminDisputesPage';
import { Box, Button, Typography } from '@mui/material';

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Uncaught error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h5" gutterBottom>Something went wrong.</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Please refresh the page. If the problem persists, contact support.
          </Typography>
          <Button variant="contained" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    },
  },
});

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  redirectTo?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requireAuth = true, 
  redirectTo = '/login' 
}) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (requireAuth && !isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  if (!requireAuth && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const AppContent: React.FC = () => {
  const { loading } = useAuth();
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {!isAdminRoute && <Navigation />}
      <Box component="main" sx={{ flexGrow: 1 }}>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<HomePage />} />
          <Route 
            path="/login" 
            element={
              <ProtectedRoute requireAuth={false}>
                <LoginForm />
              </ProtectedRoute>
            } 
          />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/register"
            element={
              <ProtectedRoute requireAuth={false}>
                <RegisterForm />
              </ProtectedRoute>
            } 
          />

          {/* Protected routes */}
          <Route 
            path="/providers" 
            element={
              <ProtectedRoute>
                <FindProvidersPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/bookings" 
            element={
              <ProtectedRoute>
                <MyBookingsPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/profile" 
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <ProviderDashboardPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/messages" 
            element={
              <ProtectedRoute>
                <MessagingPage />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/payments" 
            element={
              <ProtectedRoute>
                <PaymentsPage />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/quotes"
            element={
              <ProtectedRoute>
                <MyQuotesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reviews"
            element={
              <ProtectedRoute>
                <MyReviewsPage />
              </ProtectedRoute>
            }
          />
          <Route 
            path="/notifications" 
            element={
              <ProtectedRoute>
                <NotificationsPage />
              </ProtectedRoute>
            } 
          />

          {/* Admin routes — own layout, no top Navigation */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            }
          >
            <Route index element={<AdminDashboardPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="providers" element={<AdminProvidersPage />} />
            <Route path="reviews" element={<AdminReviewsPage />} />
            <Route path="disputes" element={<AdminDisputesPage />} />
            <Route path="settings" element={<AdminSettingsPage />} />
          </Route>

          {/* Catch all route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Box>
    </Box>
  );
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <Router>
            <AuthProvider>
              <ErrorBoundary>
                <AppContent />
              </ErrorBoundary>
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: '#fff',
                    color: '#333',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    borderRadius: '8px',
                  },
                  success: {
                    iconTheme: {
                      primary: '#4CAF50',
                      secondary: '#fff',
                    },
                  },
                  error: {
                    iconTheme: {
                      primary: '#F44336',
                      secondary: '#fff',
                    },
                  },
                }}
              />
            </AuthProvider>
          </Router>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;