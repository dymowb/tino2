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
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Home as HomeIcon,
  Search as SearchIcon,
  BookOnline as BookingIcon,
  Dashboard as DashboardIcon,
  Person as ProfileIcon,
  Business as BusinessIcon,
  ExitToApp as LogoutIcon,
  Message as MessageIcon,
  Payment as PaymentIcon,
  RateReview as ReviewIcon,
  RequestQuote as QuoteIcon,
  AdminPanelSettings as AdminIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import NotificationBadge from '../notifications/NotificationBadge';
import LanguageSwitcher from '../common/LanguageSwitcher';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { socketService } from '../../services/socketService';

const Navigation: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { user, logout, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = socketService.onNotification(() => {
      queryClient.invalidateQueries({ queryKey: ['notification-count'] });
      toast('You have a new notification');
    });

    return unsubscribe;
  }, [user, queryClient]);

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    handleUserMenuClose();
    await logout();
    navigate('/');
  };

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const navigationItems = [
    { label: t('navigation.home'), path: '/', icon: <HomeIcon />, public: true },
    ...(isAuthenticated && user?.userType === 'customer' ? [
      { label: t('navigation.find_providers'), path: '/providers', icon: <SearchIcon />, public: false },
      { label: t('navigation.my_bookings'), path: '/bookings', icon: <BookingIcon />, public: false },
      { label: t('navigation.my_quotes'), path: '/quotes', icon: <QuoteIcon />, public: false },
      { label: t('navigation.messages'), path: '/messages', icon: <MessageIcon />, public: false },
      { label: t('navigation.payments'), path: '/payments', icon: <PaymentIcon />, public: false },
      { label: t('navigation.my_reviews'), path: '/reviews', icon: <ReviewIcon />, public: false },
    ] : []),
    ...(isAuthenticated && user?.userType === 'provider' ? [
      { label: t('navigation.dashboard'), path: '/dashboard', icon: <DashboardIcon />, public: false },
      { label: t('navigation.my_quotes'), path: '/quotes', icon: <QuoteIcon />, public: false },
      { label: t('navigation.messages'), path: '/messages', icon: <MessageIcon />, public: false },
      { label: t('navigation.payments'), path: '/payments', icon: <PaymentIcon />, public: false },
      { label: t('navigation.my_reviews'), path: '/reviews', icon: <ReviewIcon />, public: false },
    ] : []),
    ...(isAuthenticated && user?.userType === 'admin' ? [
      { label: t('navigation.admin_panel'), path: '/admin', icon: <AdminIcon />, public: false },
    ] : []),
  ];

  const isActivePath = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const renderDesktopNav = () => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {navigationItems.map((item) => (
        <Button
          key={item.path}
          onClick={() => navigate(item.path)}
          startIcon={item.icon}
          sx={{
            color: 'white',
            textTransform: 'none',
            fontWeight: isActivePath(item.path) ? 600 : 400,
            backgroundColor: isActivePath(item.path) ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
            },
          }}
        >
          {item.label}
        </Button>
      ))}
    </Box>
  );

  const renderMobileDrawer = () => (
    <Drawer
      variant="temporary"
      open={mobileOpen}
      onClose={handleDrawerToggle}
      sx={{
        display: { xs: 'block', md: 'none' },
        '& .MuiDrawer-paper': { boxSizing: 'border-box', width: 240 },
      }}
    >
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ color: 'primary.main', fontWeight: 'bold' }}>
          🏠 Tino 2
        </Typography>
      </Box>
      <List>
        {navigationItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              onClick={() => {
                navigate(item.path);
                setMobileOpen(false);
              }}
              selected={isActivePath(item.path)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Drawer>
  );

  const renderUserSection = () => {
    if (!isAuthenticated || !user) {
      return (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <LanguageSwitcher />
          <Button
            color="inherit"
            onClick={() => navigate('/login')}
            sx={{ textTransform: 'none' }}
          >
            {t('navigation.login')}
          </Button>
          <Button
            color="secondary"
            variant="contained"
            onClick={() => navigate('/register')}
            sx={{ textTransform: 'none' }}
          >
            {t('navigation.register')}
          </Button>
        </Box>
      );
    }

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Chip
          label={user.userType === 'customer' ? t('profile:fields.customer') : t('profile:fields.provider')}
          size="small"
          color={user.userType === 'customer' ? 'secondary' : 'primary'}
          sx={{ color: 'white', fontWeight: 'bold' }}
        />
        <LanguageSwitcher />
        <NotificationBadge />
        <IconButton onClick={handleUserMenuOpen} sx={{ p: 0 }}>
          <Avatar
            sx={{ 
              width: 40, 
              height: 40,
              bgcolor: 'secondary.main',
              color: 'white',
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
        >
          <MenuItem onClick={() => { navigate('/profile'); handleUserMenuClose(); }}>
            <ProfileIcon sx={{ mr: 2 }} />
            {t('navigation.profile')}
          </MenuItem>
          <MenuItem onClick={handleLogout}>
            <LogoutIcon sx={{ mr: 2 }} />
            {t('navigation.logout')}
          </MenuItem>
        </Menu>
      </Box>
    );
  };

  return (
    <>
      <AppBar position="static" elevation={2}>
        <Toolbar>
          {isMobile && (
            <IconButton
              color="inherit"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
          )}

          <Typography
            variant="h6"
            component="div"
            sx={{ 
              flexGrow: { xs: 1, md: 0 },
              mr: { md: 4 },
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
            onClick={() => navigate('/')}
          >
            🏠 Tino 2
          </Typography>

          {!isMobile && (
            <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center' }}>
              {renderDesktopNav()}
            </Box>
          )}

          {renderUserSection()}
        </Toolbar>
      </AppBar>
      {renderMobileDrawer()}
    </>
  );
};

export default Navigation;