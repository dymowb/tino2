import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Container,
  Tab,
  Tabs,
  Paper,
  Stack,
  Divider,
  Switch,
  FormGroup,
  FormControlLabel,
  CircularProgress,
  IconButton,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Notifications,
  NotificationsActive,
  Settings,
  Email,
  Sms,
  ArrowBack
} from '@mui/icons-material';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
import NotificationCenter from '../notifications/NotificationCenter';
import LoadingSpinner from '../common/LoadingSpinner';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index, ...other }) => {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`notifications-tabpanel-${index}`}
      aria-labelledby={`notifications-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
};

const NotificationsPage: React.FC = () => {
  const { t } = useTranslation('notifications');
  const { user } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [searchParams, setSearchParams] = useSearchParams();

  // This page is always reached from within the app (notification bell or the
  // Profile → Notification Settings action). Give it an explicit way back so it
  // doesn't feel like a dead-end, especially on mobile (it's not in the bottom nav).
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate('/profile'));

  // Get initial tab from URL params
  const initialTab = searchParams.get('tab');
  const getTabIndex = (tab: string | null) => {
    switch (tab) {
      case 'settings':
        return 1;
      default:
        return 0;
    }
  };

  const [selectedTab, setSelectedTab] = useState(getTabIndex(initialTab));

  useEffect(() => {
    const tab = searchParams.get('tab');
    setSelectedTab(getTabIndex(tab));
  }, [searchParams]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue);
    
    // Update URL params
    const tabNames = ['notifications', 'settings'];
    const tabName = tabNames[newValue];
    
    if (tabName === 'notifications') {
      searchParams.delete('tab');
    } else {
      searchParams.set('tab', tabName === 'notifications' ? '' : tabName);
    }
    setSearchParams(searchParams);
  };

  if (!user) {
    return <LoadingSpinner />;
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <IconButton onClick={goBack} aria-label={t('back')} edge="start">
            <ArrowBack />
          </IconButton>
          <Typography variant="h4" component="h1" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center' }}>
            <Notifications sx={{ mr: 2, verticalAlign: 'middle' }} />
            {t('title')}
          </Typography>
        </Stack>
        <Typography variant="subtitle1" color="text.secondary">
          {t('subtitle')}
        </Typography>
      </Box>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={selectedTab}
          onChange={handleTabChange}
          variant={isMobile ? 'fullWidth' : 'standard'}
          indicatorColor="primary"
          textColor="primary"
          sx={{
            '& .MuiTab-root': {
              minHeight: 60,
              textTransform: 'none',
              fontWeight: 'medium',
            }
          }}
        >
          <Tab
            icon={<Notifications />}
            label={t('all')}
            iconPosition="start"
            sx={{ gap: 1 }}
          />
          <Tab
            icon={<Settings />}
            label={t('preferences.title')}
            iconPosition="start"
            sx={{ gap: 1 }}
          />
        </Tabs>
      </Paper>

      {/* Tab Content */}
      <TabPanel value={selectedTab} index={0}>
        <NotificationCenter compact={false} />
      </TabPanel>

      <TabPanel value={selectedTab} index={1}>
        <NotificationPreferencesPanel />
      </TabPanel>
    </Container>
  );
};

// Notification Preferences Panel — per-channel (email/SMS/push) toggles for each
// notification category. This is the single home for preferences; the controls
// are rendered dynamically from whatever categories the API returns per channel.
const CHANNELS: { key: 'email' | 'sms' | 'push'; icon: React.ReactNode }[] = [
  { key: 'email', icon: <Email fontSize="small" /> },
  { key: 'sms', icon: <Sms fontSize="small" /> },
  { key: 'push', icon: <NotificationsActive fontSize="small" /> },
];

const NotificationPreferencesPanel: React.FC = () => {
  const { t } = useTranslation('notifications');
  const queryClient = useQueryClient();
  const PREFS_KEY = ['notification-preferences'];

  const { data: prefs, isLoading } = useQuery({
    queryKey: PREFS_KEY,
    queryFn: () => apiService.getNotificationPreferences(),
  });

  const updateMutation = useMutation({
    mutationFn: (next: any) => apiService.updateNotificationPreferences(next),
    // Optimistic toggle so the switch responds instantly; roll back on error.
    // Apply the cache update synchronously (before the await) so back-to-back
    // toggles each build on the previous one's result rather than racing.
    onMutate: async (next: any) => {
      const prev = queryClient.getQueryData(PREFS_KEY);
      queryClient.setQueryData(PREFS_KEY, next);
      await queryClient.cancelQueries({ queryKey: PREFS_KEY });
      return { prev };
    },
    onError: (_e, _next, ctx: any) => {
      if (ctx?.prev) queryClient.setQueryData(PREFS_KEY, ctx.prev);
      toast.error(t('preferences.error'));
    },
    onSuccess: () => toast.success(t('preferences.success')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: PREFS_KEY }),
  });

  const toggle = (channel: string, category: string, value: boolean) => {
    // Read the freshest prefs from the cache (reflecting any in-flight optimistic
    // toggles), not the render-time `prefs` closure, so quick successive toggles
    // don't overwrite each other with a stale snapshot.
    const base = queryClient.getQueryData<any>(PREFS_KEY) ?? prefs;
    if (!base) return;
    updateMutation.mutate({ ...base, [channel]: { ...base[channel], [category]: value } });
  };

  // Localized category label, falling back to a humanized key for any
  // category the catalog doesn't cover yet.
  const categoryLabel = (key: string) =>
    t(`preferences.categories.${key}`, key.charAt(0).toUpperCase() + key.slice(1));

  if (isLoading || !prefs) {
    return (
      <Paper sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress size={28} />
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h6" sx={{ mb: 0.5 }}>
        {t('preferences.title')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('preferences.description')}
      </Typography>

      <Stack spacing={3}>
        {CHANNELS.map(({ key: channel, icon }) => {
          const group = (prefs[channel] && typeof prefs[channel] === 'object') ? prefs[channel] : {};
          return (
            <Box key={channel}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, color: 'primary.main' }}>
                {icon}
                <Typography variant="subtitle1" fontWeight={600} color="text.primary">
                  {t(`preferences.${channel}`)}
                </Typography>
              </Box>
              <Divider sx={{ mb: 1 }} />
              <FormGroup>
                {Object.entries(group).map(([category, value]) => (
                  <FormControlLabel
                    key={category}
                    control={
                      <Switch
                        checked={!!value}
                        onChange={(e) => toggle(channel, category, e.target.checked)}
                      />
                    }
                    label={categoryLabel(category)}
                  />
                ))}
              </FormGroup>
            </Box>
          );
        })}
      </Stack>
    </Paper>
  );
};

export default NotificationsPage;