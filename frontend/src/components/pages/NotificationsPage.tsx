import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Container,
  Tab,
  Tabs,
  Paper,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Notifications,
  Settings,
  History
} from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
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
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Get initial tab from URL params
  const initialTab = searchParams.get('tab');
  const getTabIndex = (tab: string | null) => {
    switch (tab) {
      case 'settings':
        return 1;
      case 'history':
        return 2;
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
    const tabNames = ['notifications', 'settings', 'history'];
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
        <Typography variant="h4" component="h1" fontWeight="bold" sx={{ mb: 1 }}>
          <Notifications sx={{ mr: 2, verticalAlign: 'middle' }} />
          Notifications
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Stay updated with your bookings, payments, reviews, and messages
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
            label="All Notifications"
            iconPosition="start"
            sx={{ gap: 1 }}
          />
          <Tab
            icon={<Settings />}
            label="Preferences"
            iconPosition="start"
            sx={{ gap: 1 }}
          />
          <Tab
            icon={<History />}
            label="History"
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

      <TabPanel value={selectedTab} index={2}>
        <NotificationHistoryPanel />
      </TabPanel>
    </Container>
  );
};

// Notification Preferences Panel Component
const NotificationPreferencesPanel: React.FC = () => {
  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 3 }}>
        Notification Preferences
      </Typography>
      <Typography variant="body1" color="text.secondary">
        Notification preferences are managed through the notification center settings.
        Click on any notification to access preference controls, or use the settings
        button in the notification center header.
      </Typography>
      <Box sx={{ mt: 3, p: 2, bgcolor: 'info.50', borderRadius: 1, border: 1, borderColor: 'info.200' }}>
        <Typography variant="body2" color="info.main">
          <strong>Tip:</strong> You can customize email, SMS, and push notification preferences
          for different types of notifications including bookings, payments, reviews, and messages.
        </Typography>
      </Box>
    </Paper>
  );
};

// Notification History Panel Component
const NotificationHistoryPanel: React.FC = () => {
  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 3 }}>
        Notification History
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        Your notification history shows all notifications from the past 30 days,
        including read and deleted notifications.
      </Typography>
      
      <Box sx={{ mt: 3 }}>
        <Typography variant="body2" color="text.secondary">
          <strong>Retention Policy:</strong>
        </Typography>
        <Box component="ul" sx={{ mt: 1, pl: 2 }}>
          <Typography component="li" variant="body2" color="text.secondary">
            Notifications are kept for 30 days
          </Typography>
          <Typography component="li" variant="body2" color="text.secondary">
            High-priority notifications are kept for 90 days
          </Typography>
          <Typography component="li" variant="body2" color="text.secondary">
            System notifications are kept for 1 year
          </Typography>
        </Box>
      </Box>

      <Box sx={{ mt: 3, p: 2, bgcolor: 'warning.50', borderRadius: 1, border: 1, borderColor: 'warning.200' }}>
        <Typography variant="body2" color="warning.main">
          <strong>Note:</strong> Deleted notifications cannot be recovered. Important information
          should be saved separately if needed for future reference.
        </Typography>
      </Box>
    </Paper>
  );
};

export default NotificationsPage;