import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation(['bookings']);
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showDisputeDialog, setShowDisputeDialog] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

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
      toast.success(t('bookings:messages.status_updated_success'));
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || t('bookings:messages.status_updated_error'));
    },
  });

  // Cancel booking mutation
  const cancelBookingMutation = useMutation({
    mutationFn: ({ bookingId, reason }: { bookingId: string; reason?: string }) =>
      apiService.cancelBooking(bookingId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success(t('bookings:messages.cancelled_success'));
      setShowCancelDialog(false);
      setCancelReason('');
      setSelectedBooking(null);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || t('bookings:messages.cancelled_error'));
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
      case 'pending_completion': return 'warning';
      case 'completed': return 'success';
      case 'in_dispute': return 'error';
      case 'cancelled': return 'error';
      default: return 'default';
    }
  };

  const getStatusIcon = (status: Booking['status']) => {
    switch (status) {
      case 'pending': return <Schedule />;
      case 'confirmed': return <CheckCircle />;
      case 'in_progress': return <PlayArrow />;
      case 'pending_completion': return <Schedule />;
      case 'completed': return <Done />;
      case 'in_dispute': return <Cancel />;
      case 'cancelled': return <Cancel />;
      default: return <Schedule />;
    }
  };

  const bookingAction = async (id: string, action: () => Promise<any>, successMsg: string) => {
    setActionLoading(p => ({ ...p, [id]: true }));
    try {
      await action();
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success(successMsg);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Action failed');
    } finally {
      setActionLoading(p => ({ ...p, [id]: false }));
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
      'pending_completion': [],
      'completed': [],
      'in_dispute': [],
      'cancelled': []
    };

    return statusTransitions[booking.status]?.includes(newStatus) || false;
  };

  if (!isAuthenticated) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6">{t('bookings:list.login_required')}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: '1400px', mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          {t('bookings:list.title')}
        </Typography>
        <Button
          startIcon={<Refresh />}
          onClick={() => refetch()}
          variant="outlined"
          disabled={isLoading}
        >
          {t('bookings:list.refresh')}
        </Button>
      </Box>

      {/* Status Filter */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>{t('bookings:list.filter_status')}</InputLabel>
          <Select
            value={filterStatus}
            label={t('bookings:list.filter_status')}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <MenuItem value="all">{t('bookings:list.all_status')}</MenuItem>
            <MenuItem value="pending">{t('bookings:status.pending')}</MenuItem>
            <MenuItem value="confirmed">{t('bookings:status.confirmed')}</MenuItem>
            <MenuItem value="in_progress">{t('bookings:status.in_progress')}</MenuItem>
            <MenuItem value="pending_completion">Pending Confirmation</MenuItem>
            <MenuItem value="completed">{t('bookings:status.completed')}</MenuItem>
            <MenuItem value="in_dispute">In Dispute</MenuItem>
            <MenuItem value="cancelled">{t('bookings:status.cancelled')}</MenuItem>
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
          {t('bookings:list.error_loading')}
        </Alert>
      )}

      {/* Results */}
      {!isLoading && !error && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6">
              {t(
                (pagination?.total || 0) === 1
                  ? 'bookings:list.results_count'
                  : 'bookings:list.results_count_plural',
                { count: pagination?.total || 0 }
              )}
              {filterStatus !== 'all' && ` ${t('bookings:list.filter_applied', { status: filterStatus.replace('_', ' ') })}`}
            </Typography>
          </Box>

          {bookings.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                {t('bookings:list.no_results')}
              </Typography>
              {user?.userType === 'customer' && (
                <Typography variant="body2" color="text.secondary">
                  {t('bookings:list.start_booking_prompt')}
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
                            {t('bookings:list.booking_number', { id: booking.id })}
                          </Typography>
                        </Box>
                        <Chip
                          icon={getStatusIcon(booking.status)}
                          label={t(`bookings:status.${booking.status}`)}
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
                                <strong>{t('bookings:details.scheduled')}</strong> {formatDate(booking.scheduledDate)}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <LocationOn fontSize="small" color="primary" />
                              <Typography variant="body2">
                                <strong>{t('bookings:details.location_label')}</strong> {booking.location.address}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Schedule fontSize="small" color="primary" />
                              <Typography variant="body2">
                                <strong>{t('bookings:details.duration_label')}</strong> {booking.estimatedDuration % 60 === 0 ? `${booking.estimatedDuration / 60} hours` : `${(booking.estimatedDuration / 60).toFixed(1)} hours`}
                              </Typography>
                            </Box>
                          </Stack>
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Stack spacing={1}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Payment fontSize="small" color="primary" />
                              <Typography variant="body2">
                                <strong>{t('bookings:details.total')}</strong> {formatCurrency(booking.totalAmount)}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Payment fontSize="small" color="primary" />
                              <Typography variant="body2">
                                <strong>{t('bookings:details.payment')}</strong> {booking.paymentStatus.replace('_', ' ')}
                              </Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary">
                              {t('bookings:details.created')} {formatDate(booking.createdAt)}
                            </Typography>
                          </Stack>
                        </Grid>
                      </Grid>

                      {/* Description */}
                      {booking.description && (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="body2">
                            <strong>{t('bookings:details.description_label')}</strong> {booking.description}
                          </Typography>
                        </Box>
                      )}

                      {/* Special Instructions */}
                      {booking.specialInstructions && (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="body2">
                            <strong>{t('bookings:details.special_instructions_label')}</strong> {booking.specialInstructions}
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
                              {t('bookings:actions.accept')}
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
                              {t('bookings:actions.decline')}
                            </Button>
                          </>
                        )}

                        {/* Provider: start service (places Stripe hold) */}
                        {booking.status === 'confirmed' && user?.userType === 'provider' && (
                          <Button
                            variant="contained"
                            color="secondary"
                            startIcon={actionLoading[booking.id] ? <CircularProgress size={16} /> : <PlayArrow />}
                            onClick={() => bookingAction(booking.id, () => apiService.startBooking(booking.id), 'Service started, payment held')}
                            disabled={actionLoading[booking.id]}
                          >
                            Start Service
                          </Button>
                        )}

                        {/* Provider: mark complete */}
                        {booking.status === 'in_progress' && user?.userType === 'provider' && (
                          <Button
                            variant="contained"
                            color="success"
                            startIcon={actionLoading[booking.id] ? <CircularProgress size={16} /> : <Done />}
                            onClick={() => bookingAction(booking.id, () => apiService.markBookingComplete(booking.id), 'Marked complete — awaiting customer confirmation')}
                            disabled={actionLoading[booking.id]}
                          >
                            Mark Complete
                          </Button>
                        )}

                        {/* Customer: confirm completion (captures payment) */}
                        {booking.status === 'pending_completion' && user?.userType === 'customer' && (
                          <>
                            <Button
                              variant="contained"
                              color="success"
                              startIcon={actionLoading[booking.id] ? <CircularProgress size={16} /> : <CheckCircle />}
                              onClick={() => bookingAction(booking.id, () => apiService.confirmBookingCompletion(booking.id), 'Service confirmed, payment released')}
                              disabled={actionLoading[booking.id]}
                            >
                              Confirm Complete
                            </Button>
                            <Button
                              variant="outlined"
                              color="error"
                              startIcon={<Cancel />}
                              onClick={() => { setSelectedBooking(booking); setShowDisputeDialog(true); }}
                              disabled={actionLoading[booking.id]}
                            >
                              Raise Dispute
                            </Button>
                          </>
                        )}

                        {/* Customer: leave review after completion */}
                        {booking.status === 'completed' && user?.userType === 'customer' && (
                          <Button
                            variant="outlined"
                            color="primary"
                            startIcon={<Star />}
                            onClick={() => toast(t('bookings:messages.review_coming_soon'))}
                          >
                            {t('bookings:actions.leave_review')}
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
                            {t('bookings:actions.cancel')}
                          </Button>
                        )}

                        <Button
                          variant="outlined"
                          startIcon={<Chat />}
                          onClick={() => toast(t('bookings:messages.messaging_coming_soon'))}
                        >
                          {t('bookings:actions.message')}
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
        <DialogTitle>{t('bookings:cancel.title')}</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {t('bookings:cancel.confirm')}
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={3}
            label={t('bookings:cancel.reason')}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            variant="outlined"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowCancelDialog(false)}>
            {t('bookings:actions.keep_booking')}
          </Button>
          <Button
            onClick={handleCancelBooking}
            color="error"
            variant="contained"
            disabled={cancelBookingMutation.isPending}
          >
            {cancelBookingMutation.isPending ? t('bookings:actions.cancelling') : t('bookings:actions.cancel_booking')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dispute Dialog */}
      <Dialog open={showDisputeDialog} onClose={() => setShowDisputeDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('bookings:dispute.title')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('bookings:dispute.description')}
          </Typography>
          <TextField
            fullWidth multiline rows={3}
            label={t('bookings:dispute.reason_label')}
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
            variant="outlined"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDisputeDialog(false)}>{t('bookings:dispute.cancel')}</Button>
          <Button
            onClick={() => {
              if (selectedBooking) {
                bookingAction(
                  selectedBooking.id,
                  () => apiService.disputeBooking(selectedBooking.id, disputeReason),
                  t('bookings:dispute.success')
                );
                setShowDisputeDialog(false);
                setDisputeReason('');
              }
            }}
            color="error" variant="contained"
            disabled={!disputeReason.trim() || actionLoading[selectedBooking?.id || '']}
          >
            {t('bookings:dispute.submit')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MyBookingsPage;