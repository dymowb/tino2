import React from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface NavigationProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

const Navigation: React.FC<NavigationProps> = ({ currentPage, onNavigate }) => {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    onNavigate('home');
  };

  const navStyle = {
    backgroundColor: '#2c3e50',
    padding: '15px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: 'white',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  };

  const logoStyle = {
    fontSize: '24px',
    fontWeight: 'bold',
    cursor: 'pointer'
  };

  const navLinksStyle = {
    display: 'flex',
    gap: '20px',
    alignItems: 'center'
  };

  const linkStyle = {
    color: 'white',
    textDecoration: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.3s'
  };

  const activeLinkStyle = {
    ...linkStyle,
    backgroundColor: '#34495e'
  };

  const buttonStyle = {
    ...linkStyle,
    backgroundColor: '#e74c3c',
    border: 'none'
  };

  return (
    <nav style={navStyle}>
      <div 
        style={logoStyle}
        onClick={() => onNavigate('home')}
      >
        🏠 Domestic Services
      </div>

      <div style={navLinksStyle}>
        <span
          style={currentPage === 'home' ? activeLinkStyle : linkStyle}
          onClick={() => onNavigate('home')}
        >
          Home
        </span>

        {user ? (
          <>
            {user.userType === 'customer' && (
              <>
                <span
                  style={currentPage === 'providers' ? activeLinkStyle : linkStyle}
                  onClick={() => onNavigate('providers')}
                >
                  Find Providers
                </span>
                <span
                  style={currentPage === 'bookings' ? activeLinkStyle : linkStyle}
                  onClick={() => onNavigate('bookings')}
                >
                  My Bookings
                </span>
              </>
            )}

            {user.userType === 'provider' && (
              <>
                <span
                  style={currentPage === 'dashboard' ? activeLinkStyle : linkStyle}
                  onClick={() => onNavigate('dashboard')}
                >
                  Dashboard
                </span>
                <span
                  style={currentPage === 'quotes' ? activeLinkStyle : linkStyle}
                  onClick={() => onNavigate('quotes')}
                >
                  Quote Requests
                </span>
              </>
            )}

            <span
              style={currentPage === 'profile' ? activeLinkStyle : linkStyle}
              onClick={() => onNavigate('profile')}
            >
              Profile
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '14px', opacity: 0.8 }}>
                Welcome, {user.firstName}
              </span>
              <button
                style={buttonStyle}
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          </>
        ) : (
          <>
            <span
              style={currentPage === 'login' ? activeLinkStyle : linkStyle}
              onClick={() => onNavigate('login')}
            >
              Login
            </span>
            <span
              style={currentPage === 'register' ? activeLinkStyle : linkStyle}
              onClick={() => onNavigate('register')}
            >
              Register
            </span>
          </>
        )}
      </div>
    </nav>
  );
};

export default Navigation;