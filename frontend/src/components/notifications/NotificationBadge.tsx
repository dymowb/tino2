import React, { useState, useEffect } from 'react';
import {
  IconButton,
  Badge,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Typography,
  Box,
  Button,
  useTheme
} from '@mui/material';
import {
  Notifications,
  NotificationsActive,
  Settings,
  MarkEmailRead,
  Refresh,
  Circle
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
import NotificationCenter from './NotificationCenter';
import { getNotificationText } from '../../utils/notificationText';

interface NotificationBadgeProps {
  maxDisplayCount?: number;
  showQuickActions?: boolean;
}

const NotificationBadge: React.FC<NotificationBadgeProps> = ({
  maxDisplayCount = 5,
  showQuickActions = true
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const { t } = useTranslation('common');
  const { t: tNotif } = useTranslation('notifications');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Fetch unread notification count
  const { data: notificationCount, refetch: refetchCount } = useQuery({
    queryKey: ['notification-count'],
    queryFn: () => apiService.getUnreadNotificationCount(),
    enabled: !!user,
    refetchInterval: 30000 // Refetch every 30 seconds
  });

  // Fetch recent notifications for quick preview
  const { data: recentNotifications, refetch: refetchRecent } = useQuery({
    queryKey: ['recent-notifications'],
    queryFn: () => apiService.getUserNotifications({
      page: 1,
      limit: maxDisplayCount,
      unreadOnly: false
    }),
    enabled: !!user && isMenuOpen,
    refetchInterval: isMenuOpen ? 30000 : false
  });

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    setIsMenuOpen(true);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setIsMenuOpen(false);
  };

  const handleViewAllNotifications = () => {
    navigate('/notifications');
    handleClose();
  };

  const handleSettings = () => {
    navigate('/notifications?tab=settings');
    handleClose();
  };

  const handleRefresh = () => {
    refetchCount();
    refetchRecent();
  };

  const handleMarkAllRead = async () => {
    try {
      await apiService.markAllNotificationsRead();
      refetchCount();
      refetchRecent();
    } catch (error) {
      console.error('Failed to mark notifications as read:', error);
    }
  };

  const unreadCount = notificationCount?.unreadCount || 0;
  const hasUnreadNotifications = unreadCount > 0;

  return (
    <>
      <Tooltip title={`${unreadCount} unread notifications`}>
        <IconButton
          onClick={handleClick}
          color="inherit"
          sx={{
            color: 'inherit',
            position: 'relative',
            '&:hover': { backgroundColor: 'rgba(255,255,255,0.1)' },
            ...(hasUnreadNotifications && {
              '&::after': {
                content: '""',
                position: 'absolute',
                inset: 2,
                borderRadius: '50%',
                border: '1.5px solid rgba(212,168,83,0.7)',
                animation: 'notif-pulse 2s ease-out infinite',
                pointerEvents: 'none',
              },
              '@keyframes notif-pulse': {
                '0%':   { opacity: 1, transform: 'scale(1)' },
                '70%':  { opacity: 0, transform: 'scale(1.6)' },
                '100%': { opacity: 0, transform: 'scale(1.6)' },
              },
            }),
          }}
        >
          <Badge
            badgeContent={unreadCount > 99 ? '99+' : unreadCount}
            color="error"
            invisible={!hasUnreadNotifications}
            sx={{
              '& .MuiBadge-badge': {
                fontSize: '0.75rem',
                fontWeight: 'bold',
                minWidth: unreadCount > 9 ? 22 : 18,
                height: unreadCount > 9 ? 22 : 18,
              }
            }}
          >
            {hasUnreadNotifications ? (
              <NotificationsActive />
            ) : (
              <Notifications />
            )}
          </Badge>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={isMenuOpen}
        onClose={handleClose}
        PaperProps={{
          sx: {
            width: 380,
            maxHeight: 500,
            mt: 1,
            '& .MuiMenuItem-root': {
              py: 1,
            }
          }
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        {/* Header */}
        <Box sx={{ p: 2, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6" fontWeight="bold">
              {t('notifications_panel.title')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <IconButton size="small" onClick={handleRefresh}>
                <Refresh fontSize="small" />
              </IconButton>
              <IconButton size="small" onClick={handleSettings}>
                <Settings fontSize="small" />
              </IconButton>
            </Box>
          </Box>
          {hasUnreadNotifications && (
            <Typography variant="body2" color="primary" sx={{ mt: 0.5 }}>
              {t(unreadCount === 1 ? 'notifications_panel.unread_one' : 'notifications_panel.unread_other', { count: unreadCount })}
            </Typography>
          )}
        </Box>

        {/* Quick Actions */}
        {showQuickActions && (
          <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                startIcon={<MarkEmailRead />}
                onClick={handleMarkAllRead}
                disabled={!hasUnreadNotifications}
                sx={{ fontSize: '0.75rem' }}
              >
                {t('notifications_panel.mark_read')}
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={handleViewAllNotifications}
                sx={{ fontSize: '0.75rem', ml: 'auto' }}
              >
                {t('notifications_panel.see_all')}
              </Button>
            </Box>
          </Box>
        )}

        {/* Recent Notifications */}
        {recentNotifications?.data?.length ? (
          recentNotifications.data.slice(0, maxDisplayCount).map((notification: any, index: number) => (
            <MenuItem
              key={notification.id}
              onClick={() => {
                if (notification.actionUrl) {
                  navigate(notification.actionUrl);
                } else {
                  navigate('/notifications');
                }
                handleClose();
              }}
              sx={{
                alignItems: 'flex-start',
                py: 1.5,
                borderLeft: !notification.isRead ? '3px solid' : 'none',
                borderLeftColor: 'primary.main',
                bgcolor: !notification.isRead ? 'action.hover' : 'transparent',
                '&:hover': {
                  bgcolor: 'action.selected',
                }
              }}
            >
              <ListItemIcon sx={{ minWidth: 40, mt: 0.5 }}>
                <Badge
                  variant="dot"
                  color="primary"
                  invisible={notification.isRead}
                  sx={{
                    '& .MuiBadge-badge': {
                      width: 8,
                      height: 8,
                      minWidth: 8,
                    }
                  }}
                >
                  {getNotificationIcon(notification.type)}
                </Badge>
              </ListItemIcon>
              <ListItemText
                primaryTypographyProps={{ component: 'div' }}
                secondaryTypographyProps={{ component: 'div' }}
                primary={
                  <Typography
                    variant="body2"
                    fontWeight={!notification.isRead ? 'bold' : 'normal'}
                    sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {getNotificationText(notification, tNotif).title}
                  </Typography>
                }
                secondary={
                  <Box>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        mb: 0.5,
                      }}
                    >
                      {getNotificationText(notification, tNotif).message}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatTimeAgo(notification.createdAt)}
                    </Typography>
                  </Box>
                }
              />
            </MenuItem>
          ))
        ) : (
          <MenuItem disabled>
            <ListItemText
              primary={
                <Typography variant="body2" textAlign="center" color="text.secondary">
                  Nenhuma notificação
                </Typography>
              }
            />
          </MenuItem>
        )}

        {/* View All Footer */}
        {(recentNotifications?.data?.length || 0) > 0 && (
          <>
            <Divider />
            <MenuItem onClick={handleViewAllNotifications}>
              <ListItemText
                primary={
                  <Typography
                    variant="body2"
                    textAlign="center"
                    color="primary"
                    fontWeight="medium"
                  >
                    {t('notifications_panel.see_all')}
                  </Typography>
                }
              />
            </MenuItem>
          </>
        )}
      </Menu>
    </>
  );
};

// Helper function to get appropriate icon for notification type
const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'booking':
      return <Circle sx={{ fontSize: 16, color: 'info.main' }} />;
    case 'payment':
      return <Circle sx={{ fontSize: 16, color: 'success.main' }} />;
    case 'review':
      return <Circle sx={{ fontSize: 16, color: 'warning.main' }} />;
    case 'message':
      return <Circle sx={{ fontSize: 16, color: 'primary.main' }} />;
    case 'system':
      return <Circle sx={{ fontSize: 16, color: 'secondary.main' }} />;
    default:
      return <Circle sx={{ fontSize: 16, color: 'grey.500' }} />;
  }
};

// Helper function to format time ago
const formatTimeAgo = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'Just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes}m ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}h ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days}d ago`;
  }
};

export default NotificationBadge;