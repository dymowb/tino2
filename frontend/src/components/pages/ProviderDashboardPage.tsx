import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  Alert,
  Paper,
  Avatar,
  LinearProgress,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  Switch,
  FormControlLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Dashboard,
  TrendingUp,
  CalendarToday,
  Star,
  AttachMoney,
  Person,
  Notifications,
  Settings,
  Analytics,
  EditCalendar,
  LocationOn,
  Phone,
  Email,
  Business,
  CheckCircle,
  Pending,
  Cancel,
  Schedule,
  MoreVert,
  Visibility,
  Edit,
  Reply,
  FilterList
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
import LoadingSpinner from '../common/LoadingSpinner';

const ProviderDashboardPage: React.FC = () => {
  const { t } = useTranslation(['dashboard', 'bookings']);
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const queryClient = useQueryClient();
  
  const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const;
  type Day = typeof DAYS[number];
  type DaySlot = { start: string; end: string; available: boolean };
  type AvailabilityForm = Record<Day, DaySlot>;

  const defaultAvailability: AvailabilityForm = {
    monday:    { start: '08:00', end: '18:00', available: true },
    tuesday:   { start: '08:00', end: '18:00', available: true },
    wednesday: { start: '08:00', end: '18:00', available: true },
    thursday:  { start: '08:00', end: '18:00', available: true },
    friday:    { start: '08:00', end: '18:00', available: true },
    saturday:  { start: '09:00', end: '16:00', available: false },
    sunday:    { start: '10:00', end: '15:00', available: false },
  };

  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [availabilityDialogOpen, setAvailabilityDialogOpen] = useState(false);
  const [availability, setAvailability] = useState<AvailabilityForm>(defaultAvailability);
  const [bookingMenuAnchor, setBookingMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);
  const [bookingPage, setBookingPage] = useState(0);
  const [bookingRowsPerPage, setBookingRowsPerPage] = useState(5);
  const [statusFilter, setStatusFilter] = useState('');

  // Fetch provider dashboard statistics
  const { data: dashboardStatsData, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['provider-dashboard-stats', selectedPeriod],
    queryFn: () => apiService.getProviderDashboardStats(selectedPeriod),
    enabled: user?.userType === 'provider'
  });

  const dashboardStats = dashboardStatsData?.data;

  // Fetch provider bookings
  const { data: bookings, isLoading: bookingsLoading } = useQuery({
    queryKey: ['provider-bookings', statusFilter],
    queryFn: () => apiService.getProviderBookings({ status: statusFilter || undefined, page: 1, limit: 50 }),
    enabled: user?.userType === 'provider'
  });

  // Fetch provider profile
  const { data: providerProfileData, isLoading: profileLoading } = useQuery({
    queryKey: ['my-provider-profile'],
    queryFn: () => apiService.getMyProviderProfile(),
    enabled: user?.userType === 'provider'
  });

  const providerProfile = providerProfileData?.data?.provider;

  // Fetch recent reviews
  const { data: reviews } = useQuery({
    queryKey: ['my-provider-reviews'],
    queryFn: () => apiService.getMyProviderReviews({ page: 1, limit: 5 }),
    enabled: user?.userType === 'provider'
  });

  // Update availability mutation
  const updateAvailabilityMutation = useMutation({
    mutationFn: (data: AvailabilityForm) => apiService.updateAvailability(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-provider-profile'] });
      toast.success('Availability updated!');
      setAvailabilityDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to update availability');
    },
  });

  const handleOpenAvailability = () => {
    // Seed form from saved profile data, fall back to defaults
    if (providerProfile?.availableHours) {
      setAvailability(providerProfile.availableHours as AvailabilityForm);
    } else {
      setAvailability(defaultAvailability);
    }
    setAvailabilityDialogOpen(true);
  };

  // Update booking status mutation
  const updateBookingMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiService.updateBookingStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['provider-dashboard-stats'] });
      toast.success(t('dashboard:messages.status_updated'));
      handleMenuClose();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || t('dashboard:messages.status_update_error'));
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'confirmed': return 'info';
      case 'in_progress': return 'primary';
      case 'completed': return 'success';
      case 'cancelled': return 'error';
      default: return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Pending />;
      case 'confirmed': return <CheckCircle />;
      case 'in_progress': return <Schedule />;
      case 'completed': return <CheckCircle />;
      case 'cancelled': return <Cancel />;
      default: return <Schedule />;
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, booking: any) => {
    setBookingMenuAnchor(event.currentTarget);
    setSelectedBooking(booking);
  };

  const handleMenuClose = () => {
    setBookingMenuAnchor(null);
    setSelectedBooking(null);
  };

  const handleBookingStatusUpdate = (newStatus: string) => {
    if (selectedBooking) {
      updateBookingMutation.mutate({ id: selectedBooking.id, status: newStatus });
    }
  };

  const renderStatCard = (title: string, value: string | number, icon: React.ReactNode, color: string, subtitle?: string) => (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography color="textSecondary" gutterBottom variant="body2">
              {title}
            </Typography>
            <Typography variant="h4" component="div" sx={{ color, fontWeight: 'bold' }}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="textSecondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          <Avatar sx={{ bgcolor: color, width: 56, height: 56 }}>
            {icon}
          </Avatar>
        </Box>
      </CardContent>
    </Card>
  );

  const renderRecentBookingsTable = () => {
    if (!bookings?.data?.length) {
      return (
        <Alert severity="info">
          {t('dashboard:empty.no_bookings')}
        </Alert>
      );
    }

    const displayBookings = bookings.data.slice(
      bookingPage * bookingRowsPerPage,
      bookingPage * bookingRowsPerPage + bookingRowsPerPage
    );

    return (
      <>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('dashboard:table.service')}</TableCell>
                <TableCell>{t('dashboard:table.customer')}</TableCell>
                <TableCell>{t('dashboard:table.date_time')}</TableCell>
                <TableCell>{t('dashboard:table.status')}</TableCell>
                <TableCell>{t('dashboard:table.amount')}</TableCell>
                <TableCell align="right">{t('dashboard:table.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {displayBookings.map((booking: any) => (
                <TableRow key={booking.id}>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {booking.serviceType?.replace('_', ' ')}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {typeof booking.location === 'string'
                        ? booking.location
                        : `${booking.location?.city || ''}, ${booking.location?.state || ''}`.trim().replace(/^,\s*|,\s*$/g, '') || t('dashboard:table.location_not_available')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ width: 32, height: 32 }}>
                        <Person />
                      </Avatar>
                      <Typography variant="body2">
                        {booking.customer?.firstName || 'Customer'}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {new Date(booking.scheduledDate).toLocaleDateString()}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {new Date(booking.scheduledDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={getStatusIcon(booking.status)}
                      label={booking.status?.replace('_', ' ')}
                      color={getStatusColor(booking.status) as any}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      ${booking.totalAmount}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, booking)}
                    >
                      <MoreVert />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={bookings.data.length}
          rowsPerPage={bookingRowsPerPage}
          page={bookingPage}
          onPageChange={(_, newPage) => setBookingPage(newPage)}
          onRowsPerPageChange={(e) => {
            setBookingRowsPerPage(parseInt(e.target.value, 10));
            setBookingPage(0);
          }}
        />
      </>
    );
  };

  if (user?.userType !== 'provider') {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Alert severity="error">
          <Typography variant="h6">{t('dashboard:access_denied')}</Typography>
          <Typography>{t('dashboard:provider_only')}</Typography>
        </Alert>
      </Box>
    );
  }

  if (statsLoading || bookingsLoading || profileLoading) {
    return <LoadingSpinner />;
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Dashboard color="primary" sx={{ fontSize: 40 }} />
          <Box>
            <Typography variant="h4" component="h1" fontWeight="bold">
              {t('dashboard:provider.title')}
            </Typography>
            <Typography variant="subtitle1" color="textSecondary">
              {t('dashboard:welcome', { name: user?.firstName || 'Provider' })}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            startIcon={<Edit />}
            onClick={() => setProfileDialogOpen(true)}
          >
            {t('dashboard:provider.edit_profile')}
          </Button>
          <Button
            variant="outlined"
            startIcon={<EditCalendar />}
            onClick={handleOpenAvailability}
          >
            {t('dashboard:provider.availability')}
          </Button>
          <Button
            variant="contained"
            startIcon={<Analytics />}
            onClick={() => toast(t('dashboard:provider.analytics_coming_soon'))}
          >
            {t('dashboard:provider.view_analytics')}
          </Button>
        </Box>
      </Box>

      {statsError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {t('dashboard:error_loading')}
        </Alert>
      )}

      {/* Period Selector */}
      <Box sx={{ mb: 3 }}>
        <FormControl size="small">
          <InputLabel>{t('dashboard:period.time_period')}</InputLabel>
          <Select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            label={t('dashboard:period.time_period')}
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="week">{t('dashboard:period.this_week')}</MenuItem>
            <MenuItem value="month">{t('dashboard:period.this_month')}</MenuItem>
            <MenuItem value="quarter">{t('dashboard:period.this_quarter')}</MenuItem>
            <MenuItem value="year">{t('dashboard:period.this_year')}</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          {renderStatCard(
            t('dashboard:provider.total_bookings'),
            dashboardStats?.totalBookings || 0,
            <CalendarToday />,
            theme.palette.primary.main,
            t('dashboard:messages.growth_period', {
              percent: dashboardStats?.bookingGrowth || 0,
              period: t(`dashboard:period.${selectedPeriod}`)
            })
          )}
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          {renderStatCard(
            t('dashboard:provider.pending_requests'),
            dashboardStats?.pendingBookings || 0,
            <Pending />,
            theme.palette.warning.main,
            t('dashboard:provider.requires_attention')
          )}
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          {renderStatCard(
            t('dashboard:provider.completed_jobs'),
            dashboardStats?.completedBookings || 0,
            <CheckCircle />,
            theme.palette.success.main,
            t('dashboard:provider.completion_rate', { rate: dashboardStats?.completionRate || 0 })
          )}
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          {renderStatCard(
            t('dashboard:provider.total_earnings'),
            `$${dashboardStats?.totalEarnings || 0}`,
            <AttachMoney />,
            theme.palette.info.main,
            t('dashboard:messages.growth_period', {
              percent: dashboardStats?.earningsGrowth || 0,
              period: t(`dashboard:period.${selectedPeriod}`)
            })
          )}
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          {renderStatCard(
            t('dashboard:provider.average_rating'),
            `${dashboardStats?.averageRating || providerProfile?.rating || 0}`,
            <Star />,
            theme.palette.secondary.main,
            t('dashboard:provider.based_on_reviews', { count: reviews?.pagination?.total || 0 })
          )}
        </Grid>
        <Grid item xs={12} sm={6} md={4} lg={2}>
          {renderStatCard(
            t('dashboard:provider.response_rate'),
            `${dashboardStats?.responseRate || 95}%`,
            <Reply />,
            theme.palette.success.main,
            t('dashboard:provider.avg_response_time', { time: 2 })
          )}
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Recent Bookings */}
        <Grid item xs={12} lg={8}>
          <Card sx={{ height: 'fit-content' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" fontWeight="bold">
                  {t('dashboard:provider.recent_bookings')}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel>{t('dashboard:filters.status_filter')}</InputLabel>
                    <Select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      label={t('dashboard:filters.status_filter')}
                      startAdornment={<FilterList />}
                    >
                      <MenuItem value="">{t('dashboard:filters.all_status')}</MenuItem>
                      <MenuItem value="pending">{t('bookings:status.pending')}</MenuItem>
                      <MenuItem value="confirmed">{t('bookings:status.confirmed')}</MenuItem>
                      <MenuItem value="in_progress">{t('bookings:status.in_progress')}</MenuItem>
                      <MenuItem value="completed">{t('bookings:status.completed')}</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              </Box>
              <Divider sx={{ mb: 2 }} />
              {renderRecentBookingsTable()}
            </CardContent>
          </Card>
        </Grid>

        {/* Provider Profile Summary & Quick Actions */}
        <Grid item xs={12} lg={4}>
          <Grid container spacing={3}>
            {/* Profile Summary */}
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                    {t('dashboard:provider.profile_summary')}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Avatar
                      sx={{ width: 60, height: 60, bgcolor: 'primary.main' }}
                      src={providerProfile?.profileImage}
                    >
                      {user?.firstName?.[0]}
                    </Avatar>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="h6">
                        {user?.firstName} {user?.lastName}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        {providerProfile?.businessName || t('dashboard:provider.service_provider')}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                        <Star sx={{ fontSize: 16, color: 'gold' }} />
                        <Typography variant="body2">
                          {providerProfile?.rating ? Number(providerProfile.rating).toFixed(1) : t('dashboard:provider.no_rating')}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LocationOn sx={{ fontSize: 16, color: 'text.secondary' }} />
                      <Typography variant="body2" color="textSecondary">
                        {typeof providerProfile?.location === 'string'
                          ? providerProfile.location
                          : providerProfile?.location?.address || t('dashboard:provider.location_not_set')}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Phone sx={{ fontSize: 16, color: 'text.secondary' }} />
                      <Typography variant="body2" color="textSecondary">
                        {user?.phone || t('dashboard:provider.phone_not_set')}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Email sx={{ fontSize: 16, color: 'text.secondary' }} />
                      <Typography variant="body2" color="textSecondary">
                        {user?.email}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Business sx={{ fontSize: 16, color: 'text.secondary' }} />
                      <Typography variant="body2" color="textSecondary">
                        {providerProfile?.services?.join(', ') || t('dashboard:provider.services_not_set')}
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                      {t('dashboard:provider.profile_completion')}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={providerProfile?.profileCompletion || 70}
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                    <Typography variant="caption" color="textSecondary">
                      {t('dashboard:provider.percent_complete', { percent: providerProfile?.profileCompletion || 70 })}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Recent Reviews */}
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                    {t('dashboard:provider.recent_reviews')}
                  </Typography>
                  {reviews?.data?.length ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {reviews.data.slice(0, 3).map((review: any) => (
                        <Box key={review.id} sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Box sx={{ display: 'flex' }}>
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  sx={{
                                    fontSize: 16,
                                    color: i < review.rating ? 'gold' : 'grey.300'
                                  }}
                                />
                              ))}
                            </Box>
                            <Typography variant="caption" color="textSecondary">
                              {new Date(review.createdAt).toLocaleDateString()}
                            </Typography>
                          </Box>
                          <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                            {review.comment?.substring(0, 100)}
                            {review.comment?.length > 100 && '...'}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            - {review.customer?.firstName || 'Customer'}
                          </Typography>
                        </Box>
                      ))}
                      <Button size="small" variant="outlined" fullWidth>
                        {t('dashboard:actions.view_all_reviews')}
                      </Button>
                    </Box>
                  ) : (
                    <Alert severity="info">
                      {t('dashboard:empty.no_reviews')}
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Grid>
      </Grid>

      {/* Booking Actions Menu */}
      <Menu
        anchorEl={bookingMenuAnchor}
        open={Boolean(bookingMenuAnchor)}
        onClose={handleMenuClose}
      >
        {selectedBooking?.status === 'pending' && [
          <MenuItem key="confirm" onClick={() => handleBookingStatusUpdate('confirmed')}>
            <CheckCircle sx={{ mr: 1 }} /> {t('dashboard:actions.confirm_booking')}
          </MenuItem>,
          <MenuItem key="cancel" onClick={() => handleBookingStatusUpdate('cancelled')}>
            <Cancel sx={{ mr: 1 }} /> {t('dashboard:actions.decline_booking')}
          </MenuItem>
        ]}
        {selectedBooking?.status === 'confirmed' && (
          <MenuItem onClick={() => handleBookingStatusUpdate('in_progress')}>
            <Schedule sx={{ mr: 1 }} /> {t('dashboard:actions.start_service')}
          </MenuItem>
        )}
        {selectedBooking?.status === 'in_progress' && (
          <MenuItem onClick={() => handleBookingStatusUpdate('completed')}>
            <CheckCircle sx={{ mr: 1 }} /> {t('dashboard:actions.mark_complete')}
          </MenuItem>
        )}
        <MenuItem onClick={handleMenuClose}>
          <Visibility sx={{ mr: 1 }} /> {t('dashboard:actions.view_details')}
        </MenuItem>
      </Menu>

      {/* Profile Edit Dialog */}
      <Dialog open={profileDialogOpen} onClose={() => setProfileDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('dashboard:dialogs.edit_profile_title')}</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            {t('dashboard:dialogs.edit_profile_info')}
          </Alert>
          <Typography variant="body2">
            {t('dashboard:dialogs.edit_profile_desc')}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProfileDialogOpen(false)}>{t('dashboard:dialogs.close')}</Button>
        </DialogActions>
      </Dialog>

      {/* Availability Dialog */}
      <Dialog open={availabilityDialogOpen} onClose={() => setAvailabilityDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Weekly Availability</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Set your working hours for each day. Customers will only be able to book you during available hours.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {DAYS.map((day) => (
              <Box
                key={day}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr',
                  alignItems: 'center',
                  gap: 2,
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: availability[day].available ? 'action.hover' : 'transparent',
                  opacity: availability[day].available ? 1 : 0.5,
                }}
              >
                <FormControlLabel
                  control={
                    <Switch
                      checked={availability[day].available}
                      onChange={(e) => setAvailability(prev => ({
                        ...prev,
                        [day]: { ...prev[day], available: e.target.checked },
                      }))}
                      size="small"
                    />
                  }
                  label={<Typography variant="body2" sx={{ textTransform: 'capitalize', fontWeight: 500 }}>{day}</Typography>}
                />
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <TextField
                    type="time"
                    size="small"
                    value={availability[day].start}
                    disabled={!availability[day].available}
                    onChange={(e) => setAvailability(prev => ({
                      ...prev,
                      [day]: { ...prev[day], start: e.target.value },
                    }))}
                    inputProps={{ step: 1800 }}
                    sx={{ width: 120 }}
                  />
                  <Typography variant="body2" color="text.secondary">to</Typography>
                  <TextField
                    type="time"
                    size="small"
                    value={availability[day].end}
                    disabled={!availability[day].available}
                    onChange={(e) => setAvailability(prev => ({
                      ...prev,
                      [day]: { ...prev[day], end: e.target.value },
                    }))}
                    inputProps={{ step: 1800 }}
                    sx={{ width: 120 }}
                  />
                </Box>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAvailabilityDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => updateAvailabilityMutation.mutate(availability)}
            disabled={updateAvailabilityMutation.isPending}
          >
            {updateAvailabilityMutation.isPending ? 'Saving...' : 'Save Availability'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProviderDashboardPage;