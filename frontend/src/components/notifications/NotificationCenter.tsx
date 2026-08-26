import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toInternalPath } from '../../utils/internalPath';
import { getNotificationText, type NotificationI18n } from '../../utils/notificationText';
import {
  Box,
  Typography,
  Card,
  CardContent,
  IconButton,
  Badge,
  Menu,
  MenuItem,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Button,
  Chip,
  Avatar,
  Alert,
  Tabs,
  Tab,
  Paper,
  Popover,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Notifications,
  NotificationsActive,
  NotificationsOff,
  Circle,
  CheckCircle,
  Info,
  Warning,
  Error,
  BookOnline,
  Payment,
  Star,
  Message,
  Person,
  Clear,
  MarkEmailRead,
  Delete,
  FilterList,
  Refresh,
  InfoOutlined
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
import LoadingSpinner from '../common/LoadingSpinner';

interface Notification {
  id: string;
  type: 'booking' | 'payment' | 'review' | 'message' | 'system' | 'promotion';
  title: string;
  message: string;
  isRead: boolean;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  actionUrl?: string;
  metadata?: {
    bookingId?: string;
    paymentId?: string;
    reviewId?: string;
    conversationId?: string;
    i18n?: NotificationI18n;
  };
  createdAt: string;
  expiresAt?: string;
}

interface NotificationCenterProps {
  anchorEl?: HTMLElement | null;
  open?: boolean;
  onClose?: () => void;
  compact?: boolean;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({
  anchorEl,
  open = true,
  onClose,
  compact = false
}) => {
  const { user } = useAuth();
  const { t } = useTranslation('notifications');
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const queryClient = useQueryClient();

  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedNotifications, setSelectedNotifications] = useState<string[]>([]);
  const [infoAnchor, setInfoAnchor] = useState<HTMLElement | null>(null);

  // Filter tabs → query filter. Order must match the <Tab> order below.
  // Types use the singular NotificationType enum values (booking, payment, …).
  const TAB_FILTERS: { type?: string; unreadOnly?: boolean }[] = [
    {},                     // All
    { unreadOnly: true },   // Unread
    { type: 'booking' },    // Bookings
    { type: 'payment' },    // Payments
    { type: 'review' },     // Reviews
    { type: 'message' },    // Messages
  ];
  const activeFilter = TAB_FILTERS[selectedTab] ?? {};

  // Fetch notifications for the active filter
  const { data: notifications, isLoading, error, refetch } = useQuery({
    queryKey: ['notifications', activeFilter.type ?? 'all', activeFilter.unreadOnly ?? false],
    queryFn: () => apiService.getUserNotifications({
      type: activeFilter.type,
      unreadOnly: activeFilter.unreadOnly,
      page: 1,
      limit: 50
    }),
    enabled: !!user,
    refetchInterval: 30000 // Refetch every 30 seconds
  });

  // Mark notifications as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: (notificationIds: string[]) =>
      apiService.markNotificationsRead(notificationIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success(t('mark_all_read'));
      setSelectedNotifications([]);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || t('preferences.error'));
    },
  });

  // Delete notifications mutation
  const deleteNotificationsMutation = useMutation({
    mutationFn: (notificationIds: string[]) =>
      apiService.deleteNotifications(notificationIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success(t('deleted'));
      setSelectedNotifications([]);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || t('delete_failed'));
    },
  });

  const getNotificationIcon = (type: string, priority: string) => {
    const iconColor = priority === 'urgent' ? 'error' : priority === 'high' ? 'warning' : 'primary';
    
    switch (type) {
      case 'booking':
        return <BookOnline color={iconColor as any} />;
      case 'payment':
        return <Payment color={iconColor as any} />;
      case 'review':
        return <Star color={iconColor as any} />;
      case 'message':
        return <Message color={iconColor as any} />;
      case 'system':
        return <Info color={iconColor as any} />;
      case 'promotion':
        return <NotificationsActive color={iconColor as any} />;
      default:
        return <Notifications color={iconColor as any} />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'error';
      case 'high':
        return 'warning';
      case 'medium':
        return 'info';
      case 'low':
        return 'default';
      default:
        return 'default';
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read if not already read. Await it so the PATCH completes before the
    // full-page navigation below — otherwise the reload aborts the in-flight
    // request and the notification stays unread.
    if (!notification.isRead) {
      try { await markAsReadMutation.mutateAsync([notification.id]); } catch { /* navigate anyway */ }
    }

    // `actionUrl` is free text on the model, so it is validated as a same-origin
    // path before it can steer navigation, and routed rather than assigned to
    // `window.location.href`. A rejected value simply stays on this page.
    const target = toInternalPath(notification.actionUrl);
    if (target) {
      navigate(target);
    }

    if (onClose) onClose();
  };

  const handleMarkAllRead = () => {
    const unreadIds = notifications?.data?.filter((n: Notification) => !n.isRead).map((n: Notification) => n.id) || [];
    if (unreadIds.length > 0) {
      markAsReadMutation.mutate(unreadIds);
    }
  };

  const handleDeleteSelected = () => {
    if (selectedNotifications.length > 0) {
      deleteNotificationsMutation.mutate(selectedNotifications);
    }
  };

  const handleSelectNotification = (notificationId: string) => {
    setSelectedNotifications(prev =>
      prev.includes(notificationId)
        ? prev.filter(id => id !== notificationId)
        : [...prev, notificationId]
    );
  };

  const renderNotificationsList = () => {
    if (isLoading) return <LoadingSpinner />;
    
    if (error) {
      return (
        <Alert severity="error" sx={{ m: 2 }}>
          {t('preferences.error')}
        </Alert>
      );
    }

    if (!notifications?.data?.length) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <NotificationsOff sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            {t('no_notifications')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('empty_message')}
          </Typography>
        </Box>
      );
    }

    return (
      <List sx={{ p: 0 }}>
        {notifications.data.map((notification: Notification) => (
          <React.Fragment key={notification.id}>
            {/* The row opens the notification and the icon marks it selected: two
                actions, so two sibling controls. Nesting the second inside the
                first is invalid semantics and buries it — `secondaryAction`
                renders it outside the row button, which is why it exists. */}
            <ListItem
              disablePadding
              secondaryAction={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {!notification.isRead && (
                    <Circle sx={{ fontSize: 8, color: 'primary.main' }} />
                  )}
                  <IconButton
                    size="small"
                    aria-label={t('select')}
                    aria-pressed={selectedNotifications.includes(notification.id)}
                    onClick={() => handleSelectNotification(notification.id)}
                    color={selectedNotifications.includes(notification.id) ? 'primary' : 'default'}
                  >
                    <CheckCircle />
                  </IconButton>
                </Box>
              }
              sx={{
                bgcolor: !notification.isRead ? 'action.hover' : 'transparent',
                borderLeft: notification.priority === 'urgent' ? '4px solid' : 'none',
                borderLeftColor: 'error.main'
              }}
            >
            <ListItemButton
              sx={{ '&:hover': { bgcolor: 'action.selected' } }}
              onClick={() => handleNotificationClick(notification)}
            >
              <ListItemIcon>
                <Badge
                  variant="dot"
                  color={getPriorityColor(notification.priority) as any}
                  invisible={notification.isRead}
                >
                  {getNotificationIcon(notification.type, notification.priority)}
                </Badge>
              </ListItemIcon>
              <ListItemText
                primaryTypographyProps={{ component: 'div' }}
                secondaryTypographyProps={{ component: 'div' }}
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography
                      variant="body2"
                      fontWeight={!notification.isRead ? 'bold' : 'normal'}
                    >
                      {getNotificationText(notification, t).title}
                    </Typography>
                    <Chip
                      label={notification.type}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: '0.7rem', height: 20 }}
                    />
                  </Box>
                }
                secondary={
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      {getNotificationText(notification, t).message}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(notification.createdAt).toLocaleString()}
                    </Typography>
                  </Box>
                }
              />
            </ListItemButton>
            </ListItem>
            <Divider />
          </React.Fragment>
        ))}
      </List>
    );
  };

  if (compact && anchorEl) {
    return (
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={onClose}
        PaperProps={{ sx: { width: 400, maxHeight: 500 } }}
      >
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6">{t('title')}</Typography>
        </Box>
        {renderNotificationsList()}
      </Menu>
    );
  }

  return (
    <Box sx={{ width: '100%', maxWidth: 800, mx: 'auto' }}>
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h5" fontWeight="bold">
            {t('title')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <IconButton onClick={() => refetch()} disabled={isLoading} title={t('refresh')}>
              <Refresh />
            </IconButton>
            <IconButton onClick={(e) => setInfoAnchor(e.currentTarget)} title={t('history.title')}>
              <InfoOutlined />
            </IconButton>
          </Box>
        </Box>

        {/* Retention / deletion info — folded in from the old History tab. */}
        <Popover
          open={Boolean(infoAnchor)}
          anchorEl={infoAnchor}
          onClose={() => setInfoAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { sx: { p: 2, maxWidth: 340 } } }}
        >
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
            {t('history.page_title')}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block' }}>
            {t('history.retention_policy')}
          </Typography>
          <Box component="ul" sx={{ mt: 0.5, mb: 1.5, pl: 2 }}>
            <Typography component="li" variant="caption" color="text.secondary">{t('history.retention_30_days')}</Typography>
            <Typography component="li" variant="caption" color="text.secondary">{t('history.retention_90_days')}</Typography>
            <Typography component="li" variant="caption" color="text.secondary">{t('history.retention_1_year')}</Typography>
          </Box>
          <Typography variant="caption" color="text.secondary">
            <strong>{t('history.note_label')}</strong> {t('history.note_message')}
          </Typography>
        </Popover>
        
        <Box sx={{ px: 2 }}>
          <Tabs
            value={selectedTab}
            onChange={(_, newValue) => setSelectedTab(newValue)}
            variant="scrollable"
          >
            <Tab label={t('types.all')} />
            <Tab label={t('unread')} />
            <Tab label={t('types.bookings')} />
            <Tab label={t('types.payments')} />
            <Tab label={t('types.reviews')} />
            <Tab label={t('types.messages')} />
          </Tabs>
        </Box>

        <Box sx={{ p: 2, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button
            size="small"
            startIcon={<MarkEmailRead />}
            onClick={handleMarkAllRead}
            disabled={markAsReadMutation.isPending}
          >
            {t('mark_all_read')}
          </Button>
          {selectedNotifications.length > 0 && (
            <Button
              size="small"
              startIcon={<Delete />}
              onClick={handleDeleteSelected}
              disabled={deleteNotificationsMutation.isPending}
              color="error"
            >
              {t('delete')} ({selectedNotifications.length})
            </Button>
          )}
          <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
            <Chip
              label={`${notifications?.pagination?.total || 0} ${t('history.title').toLowerCase()}`}
              size="small"
              variant="outlined"
            />
            <Chip
              label={`${notifications?.data?.filter((n: Notification) => !n.isRead).length || 0} ${t('unread').toLowerCase()}`}
              size="small"
              color="primary"
            />
          </Box>
        </Box>
      </Paper>

      <Paper>
        {renderNotificationsList()}
      </Paper>
    </Box>
  );
};

export default NotificationCenter;