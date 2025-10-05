import React, { useState } from 'react';
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
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const queryClient = useQueryClient();
  
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [availabilityDialogOpen, setAvailabilityDialogOpen] = useState(false);
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

  // Update booking status mutation
  const updateBookingMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiService.updateBookingStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['provider-bookings'] });
      queryClient.invalidateQueries({ queryKey: ['provider-dashboard-stats'] });
      toast.success('Booking status updated successfully');
      handleMenuClose();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to update booking status');
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
          No bookings found. Start accepting booking requests to see them here.
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
                <TableCell>Service</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Date & Time</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell align="right">Actions</TableCell>
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
                        : `${booking.location?.city || ''}, ${booking.location?.state || ''}`.trim().replace(/^,\s*|,\s*$/g, '') || 'Location not available'}
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
          <Typography variant="h6">Access Denied</Typography>
          <Typography>This page is only available to service providers.</Typography>
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
              Provider Dashboard
            </Typography>
            <Typography variant="subtitle1" color="textSecondary">
              Welcome back, {user?.firstName || 'Provider'}!
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            startIcon={<Edit />}
            onClick={() => setProfileDialogOpen(true)}
          >
            Edit Profile
          </Button>
          <Button
            variant="outlined"
            startIcon={<EditCalendar />}
            onClick={() => setAvailabilityDialogOpen(true)}
          >
            Availability
          </Button>
          <Button
            variant="contained"
            startIcon={<Analytics />}
            onClick={() => toast('Advanced analytics coming soon!')}
          >
            View Analytics
          </Button>
        </Box>
      </Box>

      {statsError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Failed to load dashboard statistics. Please try refreshing the page.
        </Alert>
      )}

      {/* Period Selector */}
      <Box sx={{ mb: 3 }}>
        <FormControl size="small">
          <InputLabel>Time Period</InputLabel>
          <Select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            label="Time Period"
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="week">This Week</MenuItem>
            <MenuItem value="month">This Month</MenuItem>
            <MenuItem value="quarter">This Quarter</MenuItem>
            <MenuItem value="year">This Year</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid xs={12} sm={6} md={4} lg={2}>
          {renderStatCard(
            'Total Bookings',
            dashboardStats?.totalBookings || 0,
            <CalendarToday />,
            theme.palette.primary.main,
            `+${dashboardStats?.bookingGrowth || 0}% this ${selectedPeriod}`
          )}
        </Grid>
        <Grid xs={12} sm={6} md={4} lg={2}>
          {renderStatCard(
            'Pending Requests',
            dashboardStats?.pendingBookings || 0,
            <Pending />,
            theme.palette.warning.main,
            'Requires attention'
          )}
        </Grid>
        <Grid xs={12} sm={6} md={4} lg={2}>
          {renderStatCard(
            'Completed Jobs',
            dashboardStats?.completedBookings || 0,
            <CheckCircle />,
            theme.palette.success.main,
            `${dashboardStats?.completionRate || 0}% completion rate`
          )}
        </Grid>
        <Grid xs={12} sm={6} md={4} lg={2}>
          {renderStatCard(
            'Total Earnings',
            `$${dashboardStats?.totalEarnings || 0}`,
            <AttachMoney />,
            theme.palette.info.main,
            `+${dashboardStats?.earningsGrowth || 0}% this ${selectedPeriod}`
          )}
        </Grid>
        <Grid xs={12} sm={6} md={4} lg={2}>
          {renderStatCard(
            'Average Rating',
            `${dashboardStats?.averageRating || providerProfile?.rating || 0}`,
            <Star />,
            theme.palette.secondary.main,
            `Based on ${reviews?.pagination?.total || 0} reviews`
          )}
        </Grid>
        <Grid xs={12} sm={6} md={4} lg={2}>
          {renderStatCard(
            'Response Rate',
            `${dashboardStats?.responseRate || 95}%`,
            <Reply />,
            theme.palette.success.main,
            'Avg. 2 hours'
          )}
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Recent Bookings */}
        <Grid xs={12} lg={8}>
          <Card sx={{ height: 'fit-content' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" fontWeight="bold">
                  Recent Bookings
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel>Status Filter</InputLabel>
                    <Select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      label="Status Filter"
                      startAdornment={<FilterList />}
                    >
                      <MenuItem value="">All Status</MenuItem>
                      <MenuItem value="pending">Pending</MenuItem>
                      <MenuItem value="confirmed">Confirmed</MenuItem>
                      <MenuItem value="in_progress">In Progress</MenuItem>
                      <MenuItem value="completed">Completed</MenuItem>
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
        <Grid xs={12} lg={4}>
          <Grid container spacing={3}>
            {/* Profile Summary */}
            <Grid xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                    Profile Summary
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
                        {providerProfile?.businessName || 'Service Provider'}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                        <Star sx={{ fontSize: 16, color: 'gold' }} />
                        <Typography variant="body2">
                          {providerProfile?.rating?.toFixed(1) || 'No rating'}
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
                          : providerProfile?.location?.address || 'Location not set'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Phone sx={{ fontSize: 16, color: 'text.secondary' }} />
                      <Typography variant="body2" color="textSecondary">
                        {user?.phone || 'Phone not set'}
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
                        {providerProfile?.services?.join(', ') || 'Services not set'}
                      </Typography>
                    </Box>
                  </Box>
                  
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                      Profile Completion
                    </Typography>
                    <LinearProgress 
                      variant="determinate" 
                      value={providerProfile?.profileCompletion || 70} 
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                    <Typography variant="caption" color="textSecondary">
                      {providerProfile?.profileCompletion || 70}% Complete
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Recent Reviews */}
            <Grid xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                    Recent Reviews
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
                        View All Reviews
                      </Button>
                    </Box>
                  ) : (
                    <Alert severity="info">
                      No reviews yet. Complete some bookings to start receiving reviews!
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
            <CheckCircle sx={{ mr: 1 }} /> Confirm Booking
          </MenuItem>,
          <MenuItem key="cancel" onClick={() => handleBookingStatusUpdate('cancelled')}>
            <Cancel sx={{ mr: 1 }} /> Decline Booking
          </MenuItem>
        ]}
        {selectedBooking?.status === 'confirmed' && (
          <MenuItem onClick={() => handleBookingStatusUpdate('in_progress')}>
            <Schedule sx={{ mr: 1 }} /> Start Service
          </MenuItem>
        )}
        {selectedBooking?.status === 'in_progress' && (
          <MenuItem onClick={() => handleBookingStatusUpdate('completed')}>
            <CheckCircle sx={{ mr: 1 }} /> Mark Complete
          </MenuItem>
        )}
        <MenuItem onClick={handleMenuClose}>
          <Visibility sx={{ mr: 1 }} /> View Details
        </MenuItem>
      </Menu>

      {/* Profile Edit Dialog */}
      <Dialog open={profileDialogOpen} onClose={() => setProfileDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Profile</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Profile editing functionality will be implemented in a future update.
          </Alert>
          <Typography variant="body2">
            You can currently view your profile information in the summary section.
            Full profile editing capabilities including services, rates, availability, and portfolio management coming soon.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProfileDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Availability Dialog */}
      <Dialog open={availabilityDialogOpen} onClose={() => setAvailabilityDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Update Availability</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Availability management functionality will be implemented in a future update.
          </Alert>
          <Typography variant="body2">
            This feature will allow you to:
          </Typography>
          <ul>
            <li>Set working hours and days</li>
            <li>Block specific dates</li>
            <li>Configure automatic booking acceptance</li>
            <li>Set service radius and travel preferences</li>
          </ul>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAvailabilityDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProviderDashboardPage;