import React, { Component, ErrorInfo, createContext, useContext, useState, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline, GlobalStyles, Box, Button, Typography } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { createAppTheme, tokens } from './theme/theme';
import './i18n';
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
import MemoryPage from './components/pages/MemoryPage';

// ─── Color mode context ────────────────────────────────────────────────────────
export const ColorModeContext = createContext({
  mode: 'light' as 'light' | 'dark',
  toggleColorMode: () => {},
});
export const useColorMode = () => useContext(ColorModeContext);

// ─── Grain texture overlay (adds depth to cream/dark backgrounds) ──────────────
const grainStyles = {
  'body::before': {
    content: '""',
    position: 'fixed',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 9999,
    opacity: 0.035,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'repeat',
    backgroundSize: '200px 200px',
  },
} as const;

// ─── Error boundary ────────────────────────────────────────────────────────────
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
        <Box sx={{ p: 4, textAlign: 'center', mt: 8 }}>
          <Typography variant="h4" sx={{ fontFamily: tokens.font.display, mb: 2, color: 'text.primary' }}>
            Algo deu errado.
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Por favor, recarregue a página. Se o problema persistir, entre em contato com o suporte.
          </Typography>
          <Button variant="contained" onClick={() => this.setState({ error: null })}>
            Tentar novamente
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}

// ─── React Query client ────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    },
  },
});

// ─── Protected route ───────────────────────────────────────────────────────────
interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  redirectTo?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAuth = true,
  redirectTo = '/login',
}) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <LoadingSpinner />;
  if (requireAuth && !isAuthenticated) return <Navigate to={redirectTo} replace />;
  if (!requireAuth && isAuthenticated) return <Navigate to="/" replace />;

  return <>{children}</>;
};

// ─── App content (needs Router context) ───────────────────────────────────────
const AppContent: React.FC = () => {
  const { loading } = useAuth();
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  if (loading) return <LoadingSpinner />;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {!isAdminRoute && <Navigation />}
      <Box component="main" sx={{ flexGrow: 1 }}>
        <Routes>
          {/* Public */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<ProtectedRoute requireAuth={false}><LoginForm /></ProtectedRoute>} />
          <Route path="/register" element={<ProtectedRoute requireAuth={false}><RegisterForm /></ProtectedRoute>} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Protected */}
          <Route path="/providers"     element={<ProtectedRoute><FindProvidersPage /></ProtectedRoute>} />
          <Route path="/bookings"      element={<ProtectedRoute><MyBookingsPage /></ProtectedRoute>} />
          <Route path="/profile"       element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/dashboard"     element={<ProtectedRoute><ProviderDashboardPage /></ProtectedRoute>} />
          <Route path="/messages"      element={<ProtectedRoute><MessagingPage /></ProtectedRoute>} />
          <Route path="/payments"      element={<ProtectedRoute><PaymentsPage /></ProtectedRoute>} />
          <Route path="/quotes"        element={<ProtectedRoute><MyQuotesPage /></ProtectedRoute>} />
          <Route path="/reviews"       element={<ProtectedRoute><MyReviewsPage /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
          <Route path="/memory"        element={<ProtectedRoute><MemoryPage /></ProtectedRoute>} />

          {/* Admin — own layout, no top Navigation */}
          <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="users"     element={<AdminUsersPage />} />
            <Route path="providers" element={<AdminProvidersPage />} />
            <Route path="reviews"   element={<AdminReviewsPage />} />
            <Route path="disputes"  element={<AdminDisputesPage />} />
            <Route path="settings"  element={<AdminSettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Box>
    </Box>
  );
};

// ─── Root app — owns color mode state ─────────────────────────────────────────
const App: React.FC = () => {
  const [mode, setMode] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('colorMode') as 'light' | 'dark') || 'light';
  });

  const colorModeContextValue = useMemo(
    () => ({
      mode,
      toggleColorMode: () => {
        setMode((prev) => {
          const next = prev === 'light' ? 'dark' : 'light';
          localStorage.setItem('colorMode', next);
          return next;
        });
      },
    }),
    [mode]
  );

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  return (
    <ColorModeContext.Provider value={colorModeContextValue}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider theme={theme}>
            <GlobalStyles styles={grainStyles} />
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
                      background: mode === 'dark' ? tokens.color.nightCard : '#fff',
                      color: mode === 'dark' ? '#F0EBE3' : '#1A1410',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
                      borderRadius: '12px',
                      border: `1px solid ${mode === 'dark' ? tokens.color.nightBorder : tokens.color.paperDark}`,
                    },
                    success: {
                      iconTheme: { primary: tokens.color.earth, secondary: '#fff' },
                    },
                    error: {
                      iconTheme: { primary: '#C0392B', secondary: '#fff' },
                    },
                  }}
                />
              </AuthProvider>
            </Router>
          </ThemeProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </ColorModeContext.Provider>
  );
};

export default App;
