import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  IconButton,
  Avatar,
  Tooltip,
  alpha,
} from '@mui/material';
import {
  Dashboard,
  People,
  VerifiedUser,
  RateReview,
  Logout,
  Menu as MenuIcon,
  AdminPanelSettings,
  Settings,
  Gavel,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../theme/theme';

const DRAWER_WIDTH = 240;

const AdminLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const { t } = useTranslation(['admin', 'common']);
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { label: t('admin:dashboard.title'), path: '/admin',           icon: <Dashboard /> },
    { label: t('admin:users.title'),     path: '/admin/users',     icon: <People /> },
    { label: t('admin:providers.title'), path: '/admin/providers', icon: <VerifiedUser /> },
    { label: t('admin:reviews.title'),   path: '/admin/reviews',   icon: <RateReview /> },
    { label: t('admin:disputes.title'),  path: '/admin/disputes',  icon: <Gavel /> },
    { label: t('admin:settings.title'),  path: '/admin/settings',  icon: <Settings /> },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: tokens.color.earth }}>
      {/* Header */}
      <Box sx={{ px: 2.5, py: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <AdminPanelSettings sx={{ color: tokens.color.gold, fontSize: 22 }} />
        <Typography sx={{
          fontFamily: tokens.font.display,
          fontWeight: 500,
          fontSize: '1.0625rem',
          color: '#FFFFFF',
          letterSpacing: '-0.01em',
        }}>
          {t('common:navigation.admin_panel')}
        </Typography>
      </Box>

      {/* Divider */}
      <Box sx={{ mx: 2, height: '1px', bgcolor: alpha('#fff', 0.12), mb: 1 }} />

      {/* Nav links */}
      <List sx={{ flexGrow: 1, px: 1 }}>
        {navItems.map(({ label, path, icon }) => (
          <ListItem key={path} disablePadding sx={{ mb: 0.25 }}>
            <ListItemButton
              component={NavLink}
              to={path}
              end={path === '/admin'}
              sx={{
                borderRadius: tokens.radius.sm,
                py: 1,
                color: alpha('#fff', 0.72),
                '& .MuiListItemIcon-root': {
                  color: alpha('#fff', 0.5),
                  minWidth: 36,
                },
                '&:hover': {
                  bgcolor: alpha('#fff', 0.08),
                  color: '#fff',
                  '& .MuiListItemIcon-root': { color: alpha('#fff', 0.8) },
                },
                '&.active': {
                  bgcolor: alpha('#fff', 0.15),
                  color: '#fff',
                  '& .MuiListItemIcon-root': { color: tokens.color.gold },
                  '& .MuiListItemText-primary': { fontWeight: 600 },
                },
              }}
            >
              <ListItemIcon>{icon}</ListItemIcon>
              <ListItemText
                primary={label}
                primaryTypographyProps={{ fontSize: '0.875rem', fontFamily: tokens.font.body }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      {/* Footer */}
      <Box sx={{ mx: 2, height: '1px', bgcolor: alpha('#fff', 0.12), mb: 1 }} />
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar sx={{
          width: 32, height: 32,
          bgcolor: tokens.color.terra,
          fontFamily: tokens.font.display,
          fontSize: '0.875rem',
          fontWeight: 500,
        }}>
          {user?.firstName?.[0]}
        </Avatar>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography sx={{ color: '#fff', fontSize: '0.8125rem', fontWeight: 600 }} noWrap>
            {user?.firstName} {user?.lastName}
          </Typography>
          <Typography sx={{ color: alpha('#fff', 0.55), fontSize: '0.75rem' }} noWrap>
            {user?.email}
          </Typography>
        </Box>
        <Tooltip title={t('common:navigation.logout')}>
          <IconButton size="small" onClick={handleLogout} sx={{ color: alpha('#fff', 0.6), '&:hover': { color: '#fff' } }}>
            <Logout fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Mobile toggle */}
      <Box sx={{ display: { sm: 'none' }, position: 'fixed', top: 8, left: 8, zIndex: 1300 }}>
        <IconButton onClick={() => setMobileOpen(!mobileOpen)}>
          <MenuIcon />
        </IconButton>
      </Box>

      {/* Sidebar — mobile */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, border: 'none' }
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Sidebar — desktop */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', sm: 'block' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', border: 'none' },
        }}
        open
      >
        {drawerContent}
      </Drawer>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { sm: `${DRAWER_WIDTH}px` },
          minHeight: '100vh',
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
};

export default AdminLayout;
