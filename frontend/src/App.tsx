import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navigation from './components/layout/Navigation';
import HomePage from './components/pages/HomePage';
import LoginForm from './components/auth/LoginForm';
import RegisterForm from './components/auth/RegisterForm';
import FindProvidersPage from './components/pages/FindProvidersPage';
import MyBookingsPage from './components/pages/MyBookingsPage';
import ProviderDashboardPage from './components/pages/ProviderDashboardPage';
import QuoteManagementPage from './components/pages/QuoteManagementPage';
import ProfilePage from './components/pages/ProfilePage';

const AppContent: React.FC = () => {
  const { loading } = useAuth();
  const [currentPage, setCurrentPage] = useState('home');

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px'
      }}>
        Loading...
      </div>
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage />;
      case 'login':
        return <LoginForm onSwitchToRegister={() => setCurrentPage('register')} />;
      case 'register':
        return <RegisterForm onSwitchToLogin={() => setCurrentPage('login')} />;
      case 'providers':
        return <FindProvidersPage />;
      case 'bookings':
        return <MyBookingsPage />;
      case 'dashboard':
        return <ProviderDashboardPage />;
      case 'quotes':
        return <QuoteManagementPage />;
      case 'profile':
        return <ProfilePage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
      <Navigation currentPage={currentPage} onNavigate={setCurrentPage} />
      <main>
        {renderPage()}
      </main>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
