import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BottomNavigation, BottomNavigationAction, Paper, useTheme, useMediaQuery } from '@mui/material';
import {
  HomeRounded,
  SearchRounded,
  BookOnlineRounded,
  MessageRounded,
  PersonRounded,
  DashboardRounded,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { tokens } from '../../theme/theme';

const MobileBottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const { t } = useTranslation();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { isAuthenticated, user } = useAuth();
  const isDark = theme.palette.mode === 'dark';

  if (!isMobile || !isAuthenticated || !user) return null;

  // Don't show on admin routes or for admin users
  if (location.pathname.startsWith('/admin') || user.userType === 'admin') return null;

  // Labels come from i18n so they update live on language change.
  const tabs = user.userType === 'provider'
    ? [
        { label: t('navigation.home'), path: '/', icon: <HomeRounded /> },
        { label: t('navigation.dashboard'), path: '/dashboard', icon: <DashboardRounded /> },
        { label: t('navigation.bookings'), path: '/bookings', icon: <BookOnlineRounded /> },
        { label: t('navigation.messages'), path: '/messages', icon: <MessageRounded /> },
        { label: t('navigation.profile'), path: '/profile', icon: <PersonRounded /> },
      ]
    : [
        { label: t('navigation.home'), path: '/', icon: <HomeRounded /> },
        { label: t('navigation.search'), path: '/providers', icon: <SearchRounded /> },
        { label: t('navigation.bookings'), path: '/bookings', icon: <BookOnlineRounded /> },
        { label: t('navigation.messages'), path: '/messages', icon: <MessageRounded /> },
        { label: t('navigation.profile'), path: '/profile', icon: <PersonRounded /> },
      ];

  const getActiveIndex = () => {
    for (let i = tabs.length - 1; i >= 0; i--) {
      const tab = tabs[i];
      if (tab.path === '/' ? location.pathname === '/' : location.pathname.startsWith(tab.path)) {
        return i;
      }
    }
    return 0;
  };

  return (
    <Paper
      elevation={0}
      sx={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        zIndex: theme.zIndex.appBar,
        borderTop: `1px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
      }}
    >
      <BottomNavigation
        value={getActiveIndex()}
        onChange={(_, newIndex) => navigate(tabs[newIndex].path)}
        sx={{
          height: 56,
          bgcolor: isDark ? tokens.color.nightCard : tokens.color.paper,
          '& .MuiBottomNavigationAction-root': {
            fontFamily: tokens.font.body,
            fontSize: '0.6875rem',
            fontWeight: 500,
            color: isDark ? 'rgba(255,255,255,0.4)' : tokens.color.stone,
            minWidth: 0,
            padding: '6px 4px',
            gap: 0.25,
            '&.Mui-selected': {
              color: tokens.color.earth,
              fontSize: '0.6875rem',
            },
            '& .MuiBottomNavigationAction-label': {
              fontSize: '0.6875rem',
              '&.Mui-selected': { fontSize: '0.6875rem' },
            },
          },
          '& .MuiSvgIcon-root': { fontSize: '1.375rem' },
        }}
      >
        {tabs.map((tab) => (
          <BottomNavigationAction
            key={tab.path}
            label={tab.label}
            icon={tab.icon}
            showLabel
          />
        ))}
      </BottomNavigation>
    </Paper>
  );
};

export default MobileBottomNav;
