import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  IconButton,
  Menu,
  MenuItem,
  Avatar,
  Chip,
  useMediaQuery,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Person as ProfileIcon,
  ExitToApp as LogoutIcon,
  Psychology as MemoryIcon,
  Brightness4 as DarkModeIcon,
  Brightness7 as LightModeIcon,
} from '@mui/icons-material';
import { useColorMode } from '../../App';
import { useAuth } from '../../contexts/AuthContext';
import NotificationBadge from '../notifications/NotificationBadge';
import LanguageSwitcher from '../common/LanguageSwitcher';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { socketService } from '../../services/socketService';
import { tokens } from '../../theme/theme';

const TOOLBAR_HEIGHT = 64;

const Navigation: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isDark = theme.palette.mode === 'dark';
  const { user, logout, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { mode, toggleColorMode } = useColorMode();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = socketService.onNotification(() => {
      // Refresh both the badge count AND the lists (bell dropdown + center),
      // so a newly-arrived notification shows up without a manual refresh.
      queryClient.invalidateQueries({ queryKey: ['notification-count'] });
      queryClient.invalidateQueries({ queryKey: ['recent-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast(t('notifications_panel.new_received'));
    });
    return unsubscribe;
  }, [user, queryClient]);

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
  const handleUserMenuClose = () => setAnchorEl(null);

  const handleLogout = async () => {
    handleUserMenuClose();
    await logout();
    navigate('/');
  };

  const isActivePath = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  // Desktop nav links — text only, no icons
  const desktopNavItems = isAuthenticated
    ? user?.userType === 'provider'
      ? [
          { label: t('navigation.dashboard'), path: '/dashboard' },
          { label: t('navigation.my_bookings'), path: '/bookings' },
          { label: t('navigation.opportunities'), path: '/opportunities' },
          { label: t('navigation.messages'), path: '/messages' },
          { label: t('navigation.my_reviews'), path: '/reviews' },
        ]
      : user?.userType === 'admin'
      ? [{ label: t('navigation.admin_panel'), path: '/admin' }]
      : [
          { label: t('navigation.find_providers'), path: '/providers' },
          { label: t('navigation.my_bookings'), path: '/bookings' },
          { label: t('navigation.messages'), path: '/messages' },
          { label: t('navigation.my_reviews'), path: '/reviews' },
        ]
    : [{ label: t('navigation.home'), path: '/' }];

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{ height: TOOLBAR_HEIGHT }}
    >
      <Toolbar
        disableGutters
        sx={{
          height: TOOLBAR_HEIGHT,
          minHeight: `${TOOLBAR_HEIGHT}px !important`,
          px: { xs: 2, md: 4 },
          position: 'relative',
        }}
      >
        {/* Logo — left */}
        <Typography
          sx={{
            fontFamily: tokens.font.display,
            fontWeight: 500,
            fontSize: '1.25rem',
            color: '#FFFFFF',
            cursor: 'pointer',
            letterSpacing: '-0.01em',
            flexShrink: 0,
          }}
          onClick={() => navigate('/')}
        >
          🏠 Tino 2
        </Typography>

        {/* Desktop center links — absolute center */}
        {!isMobile && isAuthenticated && (
          <Box sx={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}>
            {desktopNavItems.map((item) => {
              const active = isActivePath(item.path);
              return (
                <Button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  disableRipple
                  sx={{
                    color: active ? '#FFFFFF' : 'rgba(255,255,255,0.7)',
                    fontFamily: tokens.font.body,
                    fontWeight: active ? 600 : 400,
                    fontSize: '0.875rem',
                    textTransform: 'none',
                    px: 1.5, py: 0.5,
                    minWidth: 0,
                    borderRadius: 0,
                    position: 'relative',
                    background: 'none',
                    '&:hover': {
                      background: 'none',
                      color: '#FFFFFF',
                    },
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      bottom: 0,
                      left: '50%',
                      transform: active ? 'translateX(-50%) scaleX(1)' : 'translateX(-50%) scaleX(0)',
                      width: '100%',
                      height: '2px',
                      bgcolor: tokens.color.gold,
                      transition: 'transform 0.2s ease',
                      borderRadius: '1px',
                    },
                    '&:hover::after': {
                      transform: 'translateX(-50%) scaleX(1)',
                      opacity: 0.6,
                    },
                  }}
                >
                  {item.label}
                </Button>
              );
            })}
          </Box>
        )}

        {/* Right — user section */}
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: { xs: 0.5, md: 1 } }}>
          {isAuthenticated && user ? (
            <>
              {/* User type chip — desktop only */}
              {!isMobile && (
                <Chip
                  label={user.userType === 'customer' ? t('profile:fields.customer') : t('profile:fields.provider')}
                  size="small"
                  sx={{
                    bgcolor: user.userType === 'customer'
                      ? alpha(tokens.color.terra, 0.9)
                      : alpha('#fff', 0.15),
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    height: 24,
                  }}
                />
              )}

              <IconButton
                color="inherit"
                onClick={toggleColorMode}
                size="small"
                title={mode === 'dark' ? 'Modo claro' : 'Modo escuro'}
              >
                {mode === 'dark'
                  ? <LightModeIcon sx={{ fontSize: 18 }} />
                  : <DarkModeIcon sx={{ fontSize: 18 }} />
                }
              </IconButton>

              <LanguageSwitcher />
              <NotificationBadge />

              <IconButton onClick={handleUserMenuOpen} sx={{ p: 0.5 }}>
                <Avatar
                  sx={{
                    width: 34, height: 34,
                    bgcolor: tokens.color.terra,
                    fontFamily: tokens.font.display,
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                  }}
                >
                  {user.firstName?.[0]?.toUpperCase() || 'U'}
                </Avatar>
              </IconButton>

              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleUserMenuClose}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                PaperProps={{ sx: { mt: 1, borderRadius: tokens.radius.md, minWidth: 180 } }}
              >
                <MenuItem onClick={() => { navigate('/profile'); handleUserMenuClose(); }}>
                  <ProfileIcon sx={{ mr: 1.5, fontSize: 18 }} />
                  <Typography variant="body2">{t('navigation.profile')}</Typography>
                </MenuItem>
                <MenuItem onClick={() => { navigate('/memory'); handleUserMenuClose(); }}>
                  <MemoryIcon sx={{ mr: 1.5, fontSize: 18 }} />
                  <Typography variant="body2">{t('navigation.my_memory')}</Typography>
                </MenuItem>
                <MenuItem onClick={handleLogout} sx={{ color: tokens.color.terra }}>
                  <LogoutIcon sx={{ mr: 1.5, fontSize: 18 }} />
                  <Typography variant="body2">{t('navigation.logout')}</Typography>
                </MenuItem>
              </Menu>
            </>
          ) : (
            <>
              <IconButton
                color="inherit"
                onClick={toggleColorMode}
                size="small"
              >
                {mode === 'dark'
                  ? <LightModeIcon sx={{ fontSize: 18 }} />
                  : <DarkModeIcon sx={{ fontSize: 18 }} />
                }
              </IconButton>
              <LanguageSwitcher />
              <Button
                color="inherit"
                onClick={() => navigate('/login')}
                sx={{ textTransform: 'none', fontSize: '0.875rem', fontFamily: tokens.font.body }}
              >
                {t('navigation.login')}
              </Button>
              <Button
                variant="contained"
                color="secondary"
                onClick={() => navigate('/register')}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.875rem',
                  fontFamily: tokens.font.body,
                  borderRadius: tokens.radius.full,
                  px: 2,
                }}
              >
                {t('navigation.register')}
              </Button>
            </>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Navigation;
