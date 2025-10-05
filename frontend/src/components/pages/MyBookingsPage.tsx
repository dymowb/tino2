import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Button,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Paper,
  Divider,
  IconButton,
  Tooltip,
  Stack
} from '@mui/material';
import {
  Schedule,
  LocationOn,
  Person,
  Phone,
  Email,
  Payment,
  Description,
  Chat,
  Star,
  Cancel,
  CheckCircle,
  PlayArrow,
  Done,
  Edit,
  Delete,
  Refresh
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { apiService, Booking } from '../../services/api';

const MyBookingsPage: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Fetch bookings
  const {
    data: bookingsData,
    isLoading,
    error,
    refetch
  } = useQuery({
    queryKey: ['bookings', filterStatus],
    queryFn: () => apiService.getBookings({
      ...(filterStatus !== 'all' && { status: filterStatus }),
      limit: 50
    }),
    enabled: isAuthenticated,
    staleTime: 30 * 1000, // 30 seconds
  });

  // Ensure bookings is always an array
  const bookings: Booking[] = React.useMemo(() => {
    return (bookingsData?.data && Array.isArray(bookingsData.data)) ? bookingsData.data : [];
  }, [bookingsData]);
  const pagination = {
    total: bookingsData?.pagination?.total || 0,
    page: bookingsData?.pagination?.page || 1,
    limit: bookingsData?.pagination?.limit || 20,
    pages: bookingsData?.pagination?.pages || Math.ceil((bookingsData?.pagination?.total || 0) / (bookingsData?.pagination?.limit || 20))
  };

  // Update booking status mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ bookingId, updates }: { bookingId: string; updates: Partial<Booking> }) =>
      apiService.updateBooking(bookingId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success('Booking status updated successfully!');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to update booking status');
    },
  });

  // Cancel booking mutation
  const cancelBookingMutation = useMutation({
    mutationFn: ({ bookingId, reason }: { bookingId: string; reason?: string }) =>
      apiService.cancelBooking(bookingId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success('Booking cancelled successfully');
      setShowCancelDialog(false);
      setCancelReason('');
      setSelectedBooking(null);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to cancel booking');
    },
  });

  const handleStatusUpdate = (bookingId: string, newStatus: Booking['status']) => {
    updateStatusMutation.mutate({
      bookingId,
      updates: { status: newStatus }
    });
  };

  const handleCancelBooking = () => {
    if (selectedBooking) {
      cancelBookingMutation.mutate({
        bookingId: selectedBooking.id,
        reason: cancelReason
      });
    }
  };

  const getStatusColor = (status: Booking['status']) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'confirmed': return 'info';
      case 'in_progress': return 'secondary';
      case 'completed': return 'success';
      case 'cancelled': return 'error';
      default: return 'default';
    }
  };

  const getStatusIcon = (status: Booking['status']) => {
    switch (status) {
      case 'pending': return <Schedule />;
      case 'confirmed': return <CheckCircle />;
      case 'in_progress': return <PlayArrow />;
      case 'completed': return <Done />;
      case 'cancelled': return <Cancel />;
      default: return <Schedule />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const canUpdateStatus = (booking: Booking, newStatus: Booking['status']) => {
    if (!user) return false;

    const statusTransitions: Record<Booking['status'], Booking['status'][]> = {
      'pending': user.userType === 'provider' ? ['confirmed', 'cancelled'] : ['cancelled'],
      'confirmed': user.userType === 'provider' ? ['in_progress', 'cancelled'] : ['cancelled'],
      'in_progress': user.userType === 'provider' ? ['completed'] : [],
      'completed': [],
      'cancelled': []
    };

    return statusTransitions[booking.status]?.includes(newStatus) || false;
  };

  if (!isAuthenticated) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6">Please log in to view your bookings</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: '1400px', mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          My Bookings
        </Typography>
        <Button
          startIcon={<Refresh />}
          onClick={() => refetch()}
          variant="outlined"
          disabled={isLoading}
        >
          Refresh
        </Button>
      </Box>

      {/* Status Filter */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>Filter by Status</InputLabel>
          <Select
            value={filterStatus}
            label="Filter by Status"
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <MenuItem value="all">All Bookings</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="confirmed">Confirmed</MenuItem>
            <MenuItem value="in_progress">In Progress</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
            <MenuItem value="cancelled">Cancelled</MenuItem>
          </Select>
        </FormControl>
      </Paper>

      {/* Loading State */}
      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Error State */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Failed to load bookings. Please try again.
        </Alert>
      )}

      {/* Results */}
      {!isLoading && !error && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6">
              {pagination?.total || 0} Booking{(pagination?.total || 0) !== 1 ? 's' : ''} Found
              {filterStatus !== 'all' && ` (${filterStatus.replace('_', ' ')})`}
            </Typography>
          </Box>

          {bookings.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                No bookings found matching your criteria.
              </Typography>
              {user?.userType === 'customer' && (
                <Typography variant="body2" color="text.secondary">
                  Start by finding service providers and booking services!
                </Typography>
              )}
            </Paper>
          ) : (
            <Grid container spacing={3}>
              {bookings.map((booking) => (
                <Grid item xs={12} key={booking.id}>
                  <Card sx={{ height: '100%' }}>
                    <CardContent>
                      {/* Header */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                        <Box>
                          <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1 }}>
                            {booking.serviceType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Booking #{booking.id}
                          </Typography>
                        </Box>
                        <Chip
                          icon={getStatusIcon(booking.status)}
                          label={booking.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          color={getStatusColor(booking.status)}
                          variant="filled"
                        />
                      </Box>

                      {/* Details Grid */}
                      <Grid container spacing={2} sx={{ mb: 2 }}>
                        <Grid item xs={12} md={6}>
                          <Stack spacing={1}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Schedule fontSize="small" color="primary" />
                              <Typography variant="body2">
                                <strong>Scheduled:</strong> {formatDate(booking.scheduledDate)}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <LocationOn fontSize="small" color="primary" />
                              <Typography variant="body2">
                                <strong>Location:</strong> {booking.location.address}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Schedule fontSize="small" color="primary" />
                              <Typography variant="body2">
                                <strong>Duration:</strong> {booking.estimatedDuration} hours
                              </Typography>
                            </Box>
                          </Stack>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Stack spacing={1}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Payment fontSize="small" color="primary" />
                              <Typography variant="body2">
                                <strong>Total:</strong> {formatCurrency(booking.totalAmount)}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Payment fontSize="small" color="primary" />
                              <Typography variant="body2">
                                <strong>Payment:</strong> {booking.paymentStatus.replace('_', ' ')}
                              </Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                              Created: {formatDate(booking.createdAt)}
                            </Typography>
                          </Stack>
                        </Grid>
                      </Grid>

                      {/* Description */}
                      {booking.description && (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="body2">
                            <strong>Description:</strong> {booking.description}
                          </Typography>
                        </Box>
                      )}

                      {/* Special Instructions */}
                      {booking.specialInstructions && (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="body2">
                            <strong>Special Instructions:</strong> {booking.specialInstructions}
                          </Typography>
                        </Box>
                      )}

                      <Divider sx={{ my: 2 }} />

                      {/* Action Buttons */}
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        {/* Provider Actions */}
                        {booking.status === 'pending' && user?.userType === 'provider' && (
                          <>
                            <Button
                              variant="contained"
                              color="success"
                              startIcon={<CheckCircle />}
                              onClick={() => handleStatusUpdate(booking.id, 'confirmed')}
                              disabled={updateStatusMutation.isPending}
                            >
                              Accept
                            </Button>
                            <Button
                              variant="outlined"
                              color="error"
                              startIcon={<Cancel />}
                              onClick={() => {
                                setSelectedBooking(booking);
                                setShowCancelDialog(true);
                              }}
                              disabled={updateStatusMutation.isPending}
                            >
                              Decline
                            </Button>
                          </>
                        )}

                        {booking.status === 'confirmed' && user?.userType === 'provider' && (
                          <Button
                            variant="contained"
                            color="secondary"
                            startIcon={<PlayArrow />}
                            onClick={() => handleStatusUpdate(booking.id, 'in_progress')}
                            disabled={updateStatusMutation.isPending}
                          >
                            Start Service
                          </Button>
                        )}

                        {booking.status === 'in_progress' && user?.userType === 'provider' && (
                          <Button
                            variant="contained"
                            color="success"
                            startIcon={<Done />}
                            onClick={() => handleStatusUpdate(booking.id, 'completed')}
                            disabled={updateStatusMutation.isPending}
                          >
                            Mark Complete
                          </Button>
                        )}

                        {/* Customer Actions */}
                        {booking.status === 'completed' && user?.userType === 'customer' && (
                          <Button
                            variant="outlined"
                            color="primary"
                            startIcon={<Star />}
                            onClick={() => toast('Review system - Coming in Task 6!')}
                          >
                            Leave Review
                          </Button>
                        )}

                        {/* Common Actions */}
                        {(booking.status === 'pending' || booking.status === 'confirmed') && (
                          <Button
                            variant="outlined"
                            color="error"
                            startIcon={<Cancel />}
                            onClick={() => {
                              setSelectedBooking(booking);
                              setShowCancelDialog(true);
                            }}
                            disabled={updateStatusMutation.isPending}
                          >
                            Cancel
                          </Button>
                        )}

                        <Button
                          variant="outlined"
                          startIcon={<Chat />}
                          onClick={() => toast('Messaging system - Coming in Task 4!')}
                        >
                          Message
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </>
      )}

      {/* Cancel Booking Dialog */}
      <Dialog
        open={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Cancel Booking</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Are you sure you want to cancel this booking?
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Reason for cancellation (optional)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            variant="outlined"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCancelDialog(false)}>
            Keep Booking
          </Button>
          <Button
            onClick={handleCancelBooking}
            color="error"
            variant="contained"
            disabled={cancelBookingMutation.isPending}
          >
            {cancelBookingMutation.isPending ? 'Cancelling...' : 'Cancel Booking'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MyBookingsPage;