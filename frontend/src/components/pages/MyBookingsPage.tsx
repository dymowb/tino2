import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
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
  Divider,
  Stack,
  useTheme,
  alpha
} from '@mui/material';
import {
  Schedule,
  LocationOn,
  Payment,
  Chat,
  Star,
  Cancel,
  CheckCircle,
  PlayArrow,
  Done,
  Refresh,
  AccessTime,
  ReceiptLong
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiService, Booking } from '../../services/api';
import { tokens } from '../../theme/theme';
import PageSkeleton from '../common/PageSkeleton';

const STATUS_BORDER: Record<string, string> = {
  pending:            tokens.color.gold,
  confirmed:          tokens.color.earth,
  in_progress:        tokens.color.earthLight,
  pending_completion: tokens.color.terra,
  completed:          tokens.color.stone,
  in_dispute:         tokens.color.terra,
  cancelled:          tokens.color.stone,
};

const STATUS_BG: Record<string, string> = {
  pending:            `${tokens.color.gold}14`,
  confirmed:          `${tokens.color.earth}0D`,
  in_progress:        `${tokens.color.earthLight}0D`,
  pending_completion: `${tokens.color.terra}0D`,
  completed:          `${tokens.color.stone}0D`,
  in_dispute:         `${tokens.color.terra}14`,
  cancelled:          `${tokens.color.stone}0D`,
};

const STATUS_CHIP_COLOR: Record<string, { bg: string; text: string }> = {
  pending:            { bg: `${tokens.color.gold}22`, text: tokens.color.gold },
  confirmed:          { bg: `${tokens.color.earth}18`, text: tokens.color.earthLight },
  in_progress:        { bg: `${tokens.color.earthLight}18`, text: tokens.color.earthLight },
  pending_completion: { bg: `${tokens.color.terra}18`, text: tokens.color.terra },
  completed:          { bg: `${tokens.color.stone}18`, text: tokens.color.stone },
  in_dispute:         { bg: `${tokens.color.terra}22`, text: tokens.color.terra },
  cancelled:          { bg: `${tokens.color.stone}18`, text: tokens.color.stone },
};

const StatusChip: React.FC<{ status: Booking['status']; label: string }> = ({ status, label }) => {
  const colors = STATUS_CHIP_COLOR[status] || STATUS_CHIP_COLOR.cancelled;
  return (
    <Box sx={{
      display: 'inline-flex', alignItems: 'center', gap: 0.6,
      px: 1.5, py: 0.5,
      borderRadius: tokens.radius.full,
      bgcolor: colors.bg,
      border: `1px solid ${colors.text}44`,
    }}>
      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: colors.text }} />
      <Typography sx={{
        fontFamily: tokens.font.body,
        fontSize: '0.75rem', fontWeight: 600,
        color: colors.text, lineHeight: 1,
      }}>
        {label}
      </Typography>
    </Box>
  );
};

const MyBookingsPage: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const { t } = useTranslation(['bookings']);
  const theme = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showDisputeDialog, setShowDisputeDialog] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const isDark = theme.palette.mode === 'dark';

  const { data: bookingsData, isLoading, error, refetch } = useQuery({
    queryKey: ['bookings', filterStatus],
    queryFn: () => apiService.getBookings({
      ...(filterStatus !== 'all' && { status: filterStatus }),
      limit: 100
    }),
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
  });

  const bookings: Booking[] = React.useMemo(() => {
    return (bookingsData?.data && Array.isArray(bookingsData.data)) ? bookingsData.data : [];
  }, [bookingsData]);

  const pagination = {
    total: bookingsData?.pagination?.total || 0,
  };

  const updateStatusMutation = useMutation({
    mutationFn: ({ bookingId, status }: { bookingId: string; status: string }) =>
      apiService.updateBookingStatus(bookingId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success(t('bookings:messages.status_updated_success'));
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || t('bookings:messages.status_updated_error'));
    },
  });

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
    updateStatusMutation.mutate({ bookingId, status: newStatus });
  };

  const handleCancelBooking = () => {
    if (selectedBooking) {
      cancelBookingMutation.mutate({ bookingId: selectedBooking.id, reason: cancelReason });
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

  const formatDate = (dateString: string) => new Date(dateString).toLocaleString('pt-BR', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const formatCurrency = (amount: number | string) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(amount));

  if (!isAuthenticated) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6">{t('bookings:list.login_required')}</Typography>
      </Box>
    );
  }

  const filterOptions = [
    { value: 'all', label: t('bookings:list.all_status') },
    { value: 'pending', label: t('bookings:status.pending') },
    { value: 'confirmed', label: t('bookings:status.confirmed') },
    { value: 'in_progress', label: t('bookings:status.in_progress') },
    { value: 'pending_completion', label: t('bookings:status.pending_completion') },
    { value: 'completed', label: t('bookings:status.completed') },
    { value: 'in_dispute', label: t('bookings:status.in_dispute') },
    { value: 'cancelled', label: t('bookings:status.cancelled') },
  ];

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 4, maxWidth: 900, mx: 'auto' }}>

      {/* Page header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 4 }}>
        <Box>
          <Typography sx={{
            fontFamily: tokens.font.display,
            fontSize: { xs: '1.75rem', md: '2.25rem' },
            fontWeight: 500,
            lineHeight: 1.1,
            color: 'text.primary',
          }}>
            {t('bookings:list.title')}
          </Typography>
          {pagination.total > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t('bookings:list.' + (pagination.total === 1 ? 'results_count' : 'results_count_plural'), { count: pagination.total })}
            </Typography>
          )}
        </Box>
        <Button
          startIcon={<Refresh fontSize="small" />}
          onClick={() => refetch()}
          variant="outlined"
          size="small"
          disabled={isLoading}
          sx={{ borderRadius: tokens.radius.full, px: 2 }}
        >
          {t('bookings:list.refresh')}
        </Button>
      </Box>

      {/* Filter chips */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 4 }}>
        {filterOptions.map(opt => (
          <Box
            key={opt.value}
            onClick={() => setFilterStatus(opt.value)}
            sx={{
              px: 2, py: 0.75,
              borderRadius: tokens.radius.full,
              cursor: 'pointer',
              fontSize: '0.8125rem',
              fontWeight: 500,
              fontFamily: tokens.font.body,
              border: `1px solid`,
              transition: 'all 0.15s ease',
              ...(filterStatus === opt.value ? {
                bgcolor: tokens.color.earth,
                borderColor: tokens.color.earth,
                color: '#fff',
              } : {
                bgcolor: 'transparent',
                borderColor: isDark ? tokens.color.nightBorder : tokens.color.paperDark,
                color: 'text.secondary',
                '&:hover': {
                  borderColor: tokens.color.earth,
                  color: tokens.color.earth,
                }
              })
            }}
          >
            {opt.label}
          </Box>
        ))}
      </Box>

      {isLoading && <PageSkeleton variant="list" />}

      {error && <Alert severity="error" sx={{ mb: 3 }}>{t('bookings:list.error_loading')}</Alert>}

      {!isLoading && !error && bookings.length === 0 && (
        <Box sx={{
          py: 8, textAlign: 'center',
          border: `1px dashed ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
          borderRadius: tokens.radius.lg,
        }}>
          <ReceiptLong sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
          <Typography variant="body1" color="text.secondary">{t('bookings:list.no_results')}</Typography>
          {user?.userType === 'customer' && (
            <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
              {t('bookings:list.start_booking_prompt')}
            </Typography>
          )}
        </Box>
      )}

      {/* Booking cards */}
      <AnimatePresence>
        <Stack spacing={2}>
          {bookings.map((booking, index) => {
            const borderColor = STATUS_BORDER[booking.status] || tokens.color.stone;
            const bgColor = STATUS_BG[booking.status] || 'transparent';

            return (
              <motion.div
                key={booking.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
              >
                <Box sx={{
                  borderRadius: tokens.radius.lg,
                  border: `1px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
                  bgcolor: isDark ? tokens.color.nightCard : tokens.color.paper,
                  overflow: 'hidden',
                  borderLeft: `4px solid ${borderColor}`,
                  transition: 'box-shadow 0.2s ease',
                  '&:hover': {
                    boxShadow: `0 4px 24px ${alpha(borderColor, 0.15)}`,
                  }
                }}>
                  {/* Card header */}
                  <Box sx={{
                    px: 3, pt: 2.5, pb: 2,
                    bgcolor: isDark ? alpha(bgColor, 0.5) : bgColor,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    flexWrap: 'wrap', gap: 1,
                  }}>
                    <Box>
                      <Typography sx={{
                        fontFamily: tokens.font.display,
                        fontSize: '1.125rem',
                        fontWeight: 500,
                        color: 'text.primary',
                        mb: 0.25,
                      }}>
                        {booking.serviceType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </Typography>
                      <Typography sx={{
                        fontFamily: tokens.font.mono,
                        fontSize: '0.7rem',
                        color: 'text.disabled',
                      }}>
                        #{booking.id.substring(0, 8).toUpperCase()}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Typography sx={{
                        fontFamily: tokens.font.mono,
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: booking.status === 'pending' ? tokens.color.terra : 'text.primary',
                      }}>
                        {formatCurrency(booking.totalAmount)}
                      </Typography>
                      <StatusChip status={booking.status} label={t(`bookings:status.${booking.status}`)} />
                    </Box>
                  </Box>

                  <Divider sx={{ opacity: 0.5 }} />

                  {/* Details row */}
                  <Box sx={{ px: 3, py: 2, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Schedule sx={{ fontSize: 15, color: 'text.disabled' }} />
                      <Typography variant="body2" color="text.secondary">
                        {formatDate(booking.scheduledDate)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <LocationOn sx={{ fontSize: 15, color: 'text.disabled' }} />
                      <Typography variant="body2" color="text.secondary">
                        {booking.location.address}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <AccessTime sx={{ fontSize: 15, color: 'text.disabled' }} />
                      <Typography variant="body2" color="text.secondary">
                        {booking.estimatedDuration % 60 === 0
                          ? `${booking.estimatedDuration / 60}h`
                          : `${(booking.estimatedDuration / 60).toFixed(1)}h`}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Payment sx={{ fontSize: 15, color: 'text.disabled' }} />
                      <Typography variant="body2" color="text.secondary">
                        {t(`common:payment_status.${booking.paymentStatus}`, booking.paymentStatus)}
                      </Typography>
                    </Box>
                  </Box>

                  {booking.description && (
                    <Box sx={{ px: 3, pb: 1.5 }}>
                      <Typography variant="body2" color="text.secondary" sx={{
                        borderLeft: `2px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
                        pl: 1.5, fontStyle: 'italic',
                      }}>
                        {booking.description}
                      </Typography>
                    </Box>
                  )}

                  {/* Actions */}
                  <Box sx={{
                    px: 3, pb: 2.5, pt: 1,
                    display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center'
                  }}>
                    {/* Provider: accept pending booking */}
                    {booking.status === 'pending' && user?.userType === 'provider' && (
                      <>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<CheckCircle fontSize="small" />}
                          onClick={() => handleStatusUpdate(booking.id, 'confirmed')}
                          disabled={updateStatusMutation.isPending}
                          sx={{
                            bgcolor: tokens.color.earth,
                            '&:hover': { bgcolor: tokens.color.earthLight },
                            borderRadius: tokens.radius.full, px: 2.5,
                          }}
                        >
                          {t('bookings:actions.accept')}
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<Cancel fontSize="small" />}
                          onClick={() => { setSelectedBooking(booking); setShowCancelDialog(true); }}
                          disabled={updateStatusMutation.isPending}
                          sx={{
                            borderColor: tokens.color.terra, color: tokens.color.terra,
                            '&:hover': { bgcolor: `${tokens.color.terra}0D`, borderColor: tokens.color.terraDark },
                            borderRadius: tokens.radius.full, px: 2.5,
                          }}
                        >
                          {t('bookings:actions.decline')}
                        </Button>
                      </>
                    )}

                    {/* Provider: start service */}
                    {booking.status === 'confirmed' && user?.userType === 'provider' && (
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={actionLoading[booking.id] ? <CircularProgress size={14} /> : <PlayArrow fontSize="small" />}
                        onClick={() => bookingAction(booking.id, () => apiService.startBooking(booking.id), 'Serviço iniciado, pagamento reservado')}
                        disabled={actionLoading[booking.id]}
                        sx={{
                          bgcolor: tokens.color.terra,
                          '&:hover': { bgcolor: tokens.color.terraDark },
                          borderRadius: tokens.radius.full, px: 2.5,
                        }}
                      >
                        Iniciar Serviço
                      </Button>
                    )}

                    {/* Provider: mark complete */}
                    {booking.status === 'in_progress' && user?.userType === 'provider' && (
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={actionLoading[booking.id] ? <CircularProgress size={14} /> : <Done fontSize="small" />}
                        onClick={() => bookingAction(booking.id, () => apiService.markBookingComplete(booking.id), 'Marcado como concluído')}
                        disabled={actionLoading[booking.id]}
                        sx={{
                          bgcolor: tokens.color.earth,
                          '&:hover': { bgcolor: tokens.color.earthLight },
                          borderRadius: tokens.radius.full, px: 2.5,
                        }}
                      >
                        Marcar Concluído
                      </Button>
                    )}

                    {/* Customer: confirm completion */}
                    {booking.status === 'pending_completion' && user?.userType === 'customer' && (
                      <>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={actionLoading[booking.id] ? <CircularProgress size={14} /> : <CheckCircle fontSize="small" />}
                          onClick={() => bookingAction(booking.id, () => apiService.confirmBookingCompletion(booking.id), 'Serviço confirmado, pagamento liberado')}
                          disabled={actionLoading[booking.id]}
                          sx={{
                            bgcolor: tokens.color.earth,
                            '&:hover': { bgcolor: tokens.color.earthLight },
                            borderRadius: tokens.radius.full, px: 2.5,
                          }}
                        >
                          Confirmar Conclusão
                        </Button>
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={<Cancel fontSize="small" />}
                          onClick={() => { setSelectedBooking(booking); setShowDisputeDialog(true); }}
                          disabled={actionLoading[booking.id]}
                          sx={{
                            borderColor: tokens.color.terra, color: tokens.color.terra,
                            borderRadius: tokens.radius.full, px: 2.5,
                          }}
                        >
                          Abrir Disputa
                        </Button>
                      </>
                    )}

                    {/* Customer: leave review */}
                    {booking.status === 'completed' && user?.userType === 'customer' && (
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<Star fontSize="small" />}
                        onClick={() => toast(t('bookings:messages.review_coming_soon'))}
                        sx={{
                          borderColor: tokens.color.gold, color: tokens.color.gold,
                          '&:hover': { bgcolor: `${tokens.color.gold}0D`, borderColor: tokens.color.gold },
                          borderRadius: tokens.radius.full, px: 2.5,
                        }}
                      >
                        {t('bookings:actions.leave_review')}
                      </Button>
                    )}

                    {/* Cancel (customer, pending/confirmed) */}
                    {(booking.status === 'pending' || booking.status === 'confirmed') && user?.userType === 'customer' && (
                      <Button
                        variant="text"
                        size="small"
                        startIcon={<Cancel fontSize="small" />}
                        onClick={() => { setSelectedBooking(booking); setShowCancelDialog(true); }}
                        disabled={updateStatusMutation.isPending}
                        sx={{ color: 'text.disabled', borderRadius: tokens.radius.full }}
                      >
                        {t('bookings:actions.cancel')}
                      </Button>
                    )}

                    <Box sx={{ flex: 1 }} />

                    <Button
                      variant="text"
                      size="small"
                      startIcon={<Chat fontSize="small" />}
                      onClick={() => {
                        const providerUserId = booking.provider?.userId;
                        navigate(providerUserId ? `/messages?with=${providerUserId}` : '/messages');
                      }}
                      sx={{ color: 'text.secondary', borderRadius: tokens.radius.full }}
                    >
                      {t('bookings:actions.message')}
                    </Button>
                  </Box>
                </Box>
              </motion.div>
            );
          })}
        </Stack>
      </AnimatePresence>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onClose={() => setShowCancelDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontFamily: tokens.font.display, fontWeight: 500 }}>
          {t('bookings:cancel.title')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>{t('bookings:cancel.confirm')}</Typography>
          <TextField
            fullWidth multiline rows={3}
            label={t('bookings:cancel.reason')}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            variant="outlined"
          />
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setShowCancelDialog(false)} sx={{ borderRadius: tokens.radius.full }}>
            {t('bookings:actions.keep_booking')}
          </Button>
          <Button
            onClick={handleCancelBooking}
            variant="contained"
            disabled={cancelBookingMutation.isPending}
            sx={{
              bgcolor: tokens.color.terra,
              '&:hover': { bgcolor: tokens.color.terraDark },
              borderRadius: tokens.radius.full,
            }}
          >
            {cancelBookingMutation.isPending ? t('bookings:actions.cancelling') : t('bookings:actions.cancel_booking')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dispute Dialog */}
      <Dialog open={showDisputeDialog} onClose={() => setShowDisputeDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontFamily: tokens.font.display, fontWeight: 500 }}>
          {t('bookings:dispute.title')}
        </DialogTitle>
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
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={() => setShowDisputeDialog(false)} sx={{ borderRadius: tokens.radius.full }}>
            {t('bookings:dispute.cancel')}
          </Button>
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
            variant="contained"
            disabled={!disputeReason.trim() || actionLoading[selectedBooking?.id || '']}
            sx={{
              bgcolor: tokens.color.terra,
              '&:hover': { bgcolor: tokens.color.terraDark },
              borderRadius: tokens.radius.full,
            }}
          >
            {t('bookings:dispute.submit')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MyBookingsPage;
