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
  Stack,
  useTheme,
  useMediaQuery,
  alpha
} from '@mui/material';
import {
  TrendingUp,
  CalendarToday,
  Star,
  AttachMoney,
  Person,
  Analytics,
  EditCalendar,
  LocationOn,
  Phone,
  Email,
  Business,
  CheckCircle,
  Cancel,
  Schedule,
  MoreVert,
  Visibility,
  Edit,
  Reply,
  FilterList,
  Pending,
  PlayArrow,
  Done,
  Chat
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
import LoadingSpinner from '../common/LoadingSpinner';
import PageSkeleton from '../common/PageSkeleton';
import { tokens } from '../../theme/theme';

// Stat card: large Fraunces number with color accent
const StatCard: React.FC<{
  label: string;
  value: string | number;
  accent: string;
  subtitle?: string;
  delay?: number;
}> = ({ label, value, accent, subtitle, delay = 0 }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      <Box sx={{
        p: 2.5,
        borderRadius: tokens.radius.lg,
        border: `1px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
        bgcolor: isDark ? tokens.color.nightCard : tokens.color.paper,
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: '3px',
          bgcolor: accent,
        }
      }}>
        <Typography sx={{
          fontFamily: tokens.font.body,
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'text.secondary',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          mb: 1,
        }}>
          {label}
        </Typography>
        <Typography sx={{
          fontFamily: tokens.font.display,
          // Scale the number down by length so currency (e.g. "R$ 12.345,67") fits the
          // narrow 6-across card on one line. Never break mid-number (no wordBreak).
          fontSize: (() => {
            const len = String(value).length;
            if (len <= 6) return '2rem';
            if (len <= 9) return '1.5rem';
            if (len <= 12) return '1.2rem';
            return '1rem';
          })(),
          fontWeight: 500,
          color: accent,
          lineHeight: 1,
          mb: subtitle ? 0.75 : 0,
          whiteSpace: 'nowrap',
        }}>
          {value}
        </Typography>
        {subtitle && (
          <Typography sx={{
            fontFamily: tokens.font.body,
            fontSize: '0.75rem',
            color: 'text.disabled',
            mt: 0.5,
          }}>
            {subtitle}
          </Typography>
        )}
      </Box>
    </motion.div>
  );
};

// Pending booking card — provider view with prominent accept/reject
const PendingBookingCard: React.FC<{
  booking: any;
  onAccept: () => void;
  onDecline: () => void;
  isPending: boolean;
}> = ({ booking, onAccept, onDecline, isPending }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const formatCurrency = (v: any) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));

  return (
    <Box sx={{
      borderRadius: tokens.radius.md,
      border: `1px solid ${tokens.color.gold}44`,
      bgcolor: isDark ? alpha(tokens.color.gold, 0.05) : alpha(tokens.color.gold, 0.04),
      borderLeft: `4px solid ${tokens.color.gold}`,
      p: 2,
    }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
        <Box>
          <Typography sx={{
            fontFamily: tokens.font.display,
            fontSize: '1rem',
            fontWeight: 500,
          }}>
            {booking.serviceType?.replace(/_/g, ' ').replace(/(^|\s)(\S)/g, (_: string, s: string, c: string) => s + c.toUpperCase())}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {booking.customer?.firstName || 'Cliente'} · {new Date(booking.scheduledDate).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </Typography>
        </Box>
        <Typography sx={{
          fontFamily: tokens.font.mono,
          fontSize: '0.9375rem',
          fontWeight: 600,
          color: tokens.color.terra,
        }}>
          {formatCurrency(booking.totalAmount)}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          variant="contained"
          size="small"
          startIcon={isPending ? <CircularProgressSmall /> : <CheckCircle fontSize="small" />}
          onClick={onAccept}
          disabled={isPending}
          sx={{
            bgcolor: tokens.color.earth,
            '&:hover': { bgcolor: tokens.color.earthLight },
            borderRadius: tokens.radius.full,
            px: 2, fontSize: '0.8125rem',
          }}
        >
          Aceitar
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<Cancel fontSize="small" />}
          onClick={onDecline}
          disabled={isPending}
          sx={{
            borderColor: tokens.color.terra, color: tokens.color.terra,
            '&:hover': { bgcolor: alpha(tokens.color.terra, 0.05) },
            borderRadius: tokens.radius.full,
            px: 2, fontSize: '0.8125rem',
          }}
        >
          Recusar
        </Button>
      </Box>
    </Box>
  );
};

const CircularProgressSmall = () => (
  <Box sx={{ width: 14, height: 14, display: 'inline-flex' }}>
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }}
    />
  </Box>
);

const ProviderDashboardPage: React.FC = () => {
  const { t } = useTranslation(['dashboard', 'bookings']);
  const { user } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isDark = theme.palette.mode === 'dark';
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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
  const [statusFilter, setStatusFilter] = useState('');

  const { data: dashboardStatsData, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['provider-dashboard-stats', selectedPeriod],
    queryFn: () => apiService.getProviderDashboardStats(selectedPeriod),
    enabled: user?.userType === 'provider'
  });
  const dashboardStats = dashboardStatsData?.data;

  const { data: bookings, isLoading: bookingsLoading } = useQuery({
    queryKey: ['provider-bookings', statusFilter],
    queryFn: () => apiService.getProviderBookings({ status: statusFilter || undefined, page: 1, limit: 50 }),
    enabled: user?.userType === 'provider'
  });

  const { data: providerProfileData, isLoading: profileLoading } = useQuery({
    queryKey: ['my-provider-profile'],
    queryFn: () => apiService.getMyProviderProfile(),
    enabled: user?.userType === 'provider'
  });
  const providerProfile = providerProfileData?.data?.provider;

  const { data: reviews } = useQuery({
    queryKey: ['my-provider-reviews'],
    queryFn: () => apiService.getMyProviderReviews({ page: 1, limit: 5 }),
    enabled: user?.userType === 'provider'
  });

  const updateAvailabilityMutation = useMutation({
    mutationFn: (data: AvailabilityForm) => apiService.updateAvailability(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-provider-profile'] });
      toast.success('Disponibilidade atualizada!');
      setAvailabilityDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Erro ao atualizar disponibilidade');
    },
  });

  const handleOpenAvailability = () => {
    if (providerProfile?.availableHours) {
      setAvailability(providerProfile.availableHours as AvailabilityForm);
    } else {
      setAvailability(defaultAvailability);
    }
    setAvailabilityDialogOpen(true);
  };

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

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, booking: any) => {
    setBookingMenuAnchor(event.currentTarget);
    setSelectedBooking(booking);
  };
  const handleMenuClose = () => {
    setBookingMenuAnchor(null);
    setSelectedBooking(null);
  };
  const handleBookingStatusUpdate = (newStatus: string) => {
    if (selectedBooking) updateBookingMutation.mutate({ id: selectedBooking.id, status: newStatus });
  };
  // Let the provider start (or reopen) a conversation with the customer for a
  // booking — the mirror of the customer's "Message" button. Available from the
  // moment a booking exists (i.e. once the quote is accepted) until it closes.
  const handleMessageCustomer = async () => {
    const booking = selectedBooking;
    handleMenuClose();
    if (!booking) return;
    const customerUserId = booking.customer?.userId || booking.customerId;
    if (!customerUserId) { navigate('/messages'); return; }
    try {
      const conv = await apiService.createConversation({
        participantIds: [customerUserId],
        metadata: { bookingId: booking.id, serviceType: booking.serviceType },
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      navigate(`/messages?conversationId=${conv.id}`);
    } catch {
      navigate(`/messages?with=${customerUserId}`);
    }
  };

  const formatCurrency = (v: any) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));

  const getStatusDot = (status: string) => {
    const map: Record<string, string> = {
      pending: tokens.color.gold,
      confirmed: tokens.color.earth,
      in_progress: tokens.color.earthLight,
      completed: tokens.color.stone,
      cancelled: tokens.color.stone,
      in_dispute: tokens.color.terra,
    };
    return map[status] || tokens.color.stone;
  };

  const pendingBookings = (bookings?.data || []).filter((b: any) => b.status === 'pending');
  const otherBookings = (bookings?.data || []).filter((b: any) => b.status !== 'pending');

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

  if (statsLoading || bookingsLoading || profileLoading) return <PageSkeleton variant="dashboard" />;

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 4, maxWidth: 1200, mx: 'auto' }}>

      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography sx={{
            fontFamily: tokens.font.display,
            fontSize: { xs: '1.75rem', md: '2.25rem' },
            fontWeight: 500,
            lineHeight: 1.1,
          }}>
            {t('dashboard:provider.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t('dashboard:welcome', { name: user?.firstName || 'Prestador' })}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<Edit fontSize="small" />}
            onClick={() => setProfileDialogOpen(true)}
            sx={{ borderRadius: tokens.radius.full }}
          >
            {t('dashboard:provider.edit_profile')}
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<EditCalendar fontSize="small" />}
            onClick={handleOpenAvailability}
            sx={{ borderRadius: tokens.radius.full }}
          >
            {t('dashboard:provider.availability')}
          </Button>
        </Box>
      </Box>

      {statsError && <Alert severity="error" sx={{ mb: 3 }}>{t('dashboard:error_loading')}</Alert>}

      {/* Period selector */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {[
            { value: 'week', label: t('dashboard:period.this_week') },
            { value: 'month', label: t('dashboard:period.this_month') },
            { value: 'quarter', label: t('dashboard:period.this_quarter') },
            { value: 'year', label: t('dashboard:period.this_year') },
          ].map(opt => (
            <Box
              key={opt.value}
              onClick={() => setSelectedPeriod(opt.value)}
              sx={{
                px: 2, py: 0.5,
                borderRadius: tokens.radius.full,
                cursor: 'pointer',
                fontSize: '0.8125rem',
                fontWeight: 500,
                fontFamily: tokens.font.body,
                border: '1px solid',
                transition: 'all 0.15s',
                ...(selectedPeriod === opt.value ? {
                  bgcolor: tokens.color.earth,
                  borderColor: tokens.color.earth,
                  color: '#fff',
                } : {
                  bgcolor: 'transparent',
                  borderColor: isDark ? tokens.color.nightBorder : tokens.color.paperDark,
                  color: 'text.secondary',
                })
              }}
            >
              {opt.label}
            </Box>
          ))}
        </Box>
      </Box>

      {/* Stats row */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            label={t('dashboard:provider.total_bookings')}
            value={dashboardStats?.totalBookings || 0}
            accent={tokens.color.earth}
            subtitle={`${dashboardStats?.bookingGrowth || 0}% este período`}
            delay={0}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            label={t('dashboard:provider.pending_requests')}
            value={dashboardStats?.pendingBookings || 0}
            accent={tokens.color.gold}
            subtitle={t('dashboard:provider.requires_attention')}
            delay={0.05}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            label={t('dashboard:provider.completed_jobs')}
            value={dashboardStats?.completedBookings || 0}
            accent={tokens.color.earthLight}
            subtitle={`${dashboardStats?.completionRate || 0}% taxa`}
            delay={0.1}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            label={t('dashboard:provider.total_earnings')}
            value={formatCurrency(dashboardStats?.totalEarnings || 0)}
            accent={tokens.color.terra}
            subtitle={`${dashboardStats?.earningsGrowth || 0}% crescimento`}
            delay={0.15}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            label={t('dashboard:provider.average_rating')}
            value={(() => { const r = parseFloat(String(dashboardStats?.averageRating ?? providerProfile?.rating ?? '')); return isNaN(r) ? '— ★' : `${r.toFixed(1)} ★`; })()}
            accent={tokens.color.gold}
            subtitle={`${reviews?.pagination?.total || 0} avaliações`}
            delay={0.2}
          />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            label={t('dashboard:provider.response_rate')}
            value={`${dashboardStats?.responseRate || 95}%`}
            accent={tokens.color.earthLight}
            subtitle="~2h resposta média"
            delay={0.25}
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Bookings section */}
        <Grid item xs={12} lg={8}>
          <Box sx={{
            borderRadius: tokens.radius.lg,
            border: `1px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
            bgcolor: isDark ? tokens.color.nightCard : tokens.color.paper,
            overflow: 'hidden',
          }}>
            <Box sx={{
              px: 3, py: 2.5,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: `1px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
            }}>
              <Typography sx={{
                fontFamily: tokens.font.display,
                fontSize: '1.125rem', fontWeight: 500,
              }}>
                {t('dashboard:provider.recent_bookings')}
              </Typography>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  displayEmpty
                  sx={{ borderRadius: tokens.radius.full, fontSize: '0.8125rem' }}
                >
                  <MenuItem value="">{t('dashboard:filters.all_status')}</MenuItem>
                  <MenuItem value="pending">{t('bookings:status.pending')}</MenuItem>
                  <MenuItem value="confirmed">{t('bookings:status.confirmed')}</MenuItem>
                  <MenuItem value="in_progress">{t('bookings:status.in_progress')}</MenuItem>
                  <MenuItem value="completed">{t('bookings:status.completed')}</MenuItem>
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ p: 2.5 }}>
              {/* Pending bookings — need action */}
              {pendingBookings.length > 0 && !statusFilter && (
                <>
                  <Typography sx={{
                    fontSize: '0.75rem', fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                    color: tokens.color.gold, mb: 1.5,
                  }}>
                    Aguardando resposta — {pendingBookings.length}
                  </Typography>
                  <Stack spacing={1.5} sx={{ mb: 3 }}>
                    {pendingBookings.map((booking: any) => (
                      <PendingBookingCard
                        key={booking.id}
                        booking={booking}
                        isPending={updateBookingMutation.isPending}
                        onAccept={() => updateBookingMutation.mutate({ id: booking.id, status: 'confirmed' })}
                        onDecline={() => updateBookingMutation.mutate({ id: booking.id, status: 'cancelled' })}
                      />
                    ))}
                  </Stack>
                  {otherBookings.length > 0 && (
                    <Typography sx={{
                      fontSize: '0.75rem', fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                      color: 'text.disabled', mb: 1.5,
                    }}>
                      Outros agendamentos
                    </Typography>
                  )}
                </>
              )}

              {/* All other bookings */}
              {(statusFilter ? bookings?.data || [] : otherBookings).length === 0 && pendingBookings.length === 0 && (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.disabled">
                    {t('dashboard:empty.no_bookings')}
                  </Typography>
                </Box>
              )}

              <Stack spacing={1}>
                {(statusFilter ? bookings?.data || [] : otherBookings).map((booking: any) => (
                  <Box
                    key={booking.id}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 2,
                      px: 2, py: 1.5,
                      borderRadius: tokens.radius.md,
                      border: `1px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
                      '&:hover': { bgcolor: isDark ? alpha('#fff', 0.02) : alpha(tokens.color.earth, 0.02) }
                    }}
                  >
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: getStatusDot(booking.status), flexShrink: 0 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontFamily: tokens.font.body, fontSize: '0.875rem', fontWeight: 500 }} noWrap>
                        {booking.serviceType?.replace(/_/g, ' ').replace(/(^|\s)(\S)/g, (_: string, s: string, c: string) => s + c.toUpperCase())}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {booking.customer?.firstName || 'Cliente'} · {new Date(booking.scheduledDate).toLocaleDateString('pt-BR')}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontFamily: tokens.font.mono, fontSize: '0.8125rem', color: 'text.secondary', flexShrink: 0 }}>
                      {formatCurrency(booking.totalAmount)}
                    </Typography>
                    {(booking.status === 'confirmed' || booking.status === 'in_progress') && (
                      <IconButton size="small" onClick={(e) => handleMenuOpen(e, booking)}>
                        <MoreVert fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                ))}
              </Stack>
            </Box>
          </Box>
        </Grid>

        {/* Right column */}
        <Grid item xs={12} lg={4}>
          <Stack spacing={3}>
            {/* Profile summary */}
            <Box sx={{
              borderRadius: tokens.radius.lg,
              border: `1px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
              bgcolor: isDark ? tokens.color.nightCard : tokens.color.paper,
              p: 2.5,
            }}>
              <Typography sx={{ fontFamily: tokens.font.display, fontSize: '1rem', fontWeight: 500, mb: 2 }}>
                {t('dashboard:provider.profile_summary')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <Avatar
                  sx={{
                    width: 52, height: 52,
                    bgcolor: tokens.color.earth,
                    fontFamily: tokens.font.display, fontSize: '1.25rem', fontWeight: 500,
                  }}
                  src={providerProfile?.profileImage}
                >
                  {user?.firstName?.[0]}
                </Avatar>
                <Box>
                  <Typography sx={{ fontWeight: 600, fontFamily: tokens.font.body }}>
                    {user?.firstName} {user?.lastName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {providerProfile?.businessName || t('dashboard:provider.service_provider')}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                    <Typography sx={{ fontFamily: tokens.font.mono, fontSize: '0.8125rem', color: tokens.color.gold }}>
                      {(() => { const r = parseFloat(String(providerProfile?.rating ?? '')); return `★ ${isNaN(r) || r === 0 ? '—' : r.toFixed(1)}`; })()}
                    </Typography>
                  </Box>
                </Box>
              </Box>

              <Divider sx={{ my: 1.5, opacity: 0.5 }} />

              <Stack spacing={1}>
                {[
                  { icon: <LocationOn sx={{ fontSize: 14 }} />, text: typeof providerProfile?.location === 'string' ? providerProfile.location : providerProfile?.location?.address || t('dashboard:provider.location_not_set') },
                  { icon: <Phone sx={{ fontSize: 14 }} />, text: user?.phone || t('dashboard:provider.phone_not_set') },
                  { icon: <Email sx={{ fontSize: 14 }} />, text: user?.email || '' },
                  { icon: <Business sx={{ fontSize: 14 }} />, text: providerProfile?.services?.join(', ') || t('dashboard:provider.services_not_set') },
                ].map((item, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <Box sx={{ color: 'text.disabled', mt: 0.15, flexShrink: 0 }}>{item.icon}</Box>
                    <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                      {item.text}
                    </Typography>
                  </Box>
                ))}
              </Stack>

              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                  <Typography variant="caption" color="text.secondary">
                    {t('dashboard:provider.profile_completion')}
                  </Typography>
                  <Typography sx={{ fontFamily: tokens.font.mono, fontSize: '0.75rem', color: tokens.color.earth }}>
                    {providerProfile?.profileCompletion || 70}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={providerProfile?.profileCompletion || 70}
                  sx={{
                    height: 4, borderRadius: 4,
                    bgcolor: isDark ? alpha('#fff', 0.08) : alpha(tokens.color.earth, 0.12),
                    '& .MuiLinearProgress-bar': { bgcolor: tokens.color.earth }
                  }}
                />
              </Box>
            </Box>

            {/* Recent reviews */}
            <Box sx={{
              borderRadius: tokens.radius.lg,
              border: `1px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
              bgcolor: isDark ? tokens.color.nightCard : tokens.color.paper,
              p: 2.5,
            }}>
              <Typography sx={{ fontFamily: tokens.font.display, fontSize: '1rem', fontWeight: 500, mb: 2 }}>
                {t('dashboard:provider.recent_reviews')}
              </Typography>

              {reviews?.data?.length ? (
                <Stack spacing={1.5}>
                  {reviews.data.slice(0, 3).map((review: any) => (
                    <Box key={review.id} sx={{
                      p: 1.5,
                      borderRadius: tokens.radius.sm,
                      bgcolor: isDark ? alpha('#fff', 0.03) : alpha(tokens.color.gold, 0.04),
                      border: `1px solid ${isDark ? tokens.color.nightBorder : alpha(tokens.color.gold, 0.15)}`,
                    }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                        <Box sx={{ display: 'flex', gap: 0.25 }}>
                          {[...Array(5)].map((_, i) => (
                            <Typography key={i} sx={{
                              fontSize: '0.75rem',
                              color: i < review.rating ? tokens.color.gold : (isDark ? '#333' : '#DDD'),
                            }}>★</Typography>
                          ))}
                        </Box>
                        <Typography variant="caption" color="text.disabled">
                          {new Date(review.createdAt).toLocaleDateString('pt-BR')}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ fontSize: '0.8125rem', lineHeight: 1.4 }}>
                        {review.comment?.substring(0, 100)}{review.comment?.length > 100 ? '...' : ''}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
                        — {review.customer?.firstName || 'Cliente'}
                      </Typography>
                    </Box>
                  ))}
                  <Button
                    size="small" variant="outlined" fullWidth
                    sx={{ borderRadius: tokens.radius.full, mt: 0.5 }}
                  >
                    {t('dashboard:actions.view_all_reviews')}
                  </Button>
                </Stack>
              ) : (
                <Typography variant="body2" color="text.disabled" sx={{ textAlign: 'center', py: 2 }}>
                  {t('dashboard:empty.no_reviews')}
                </Typography>
              )}
            </Box>
          </Stack>
        </Grid>
      </Grid>

      {/* Booking actions context menu */}
      <Menu anchorEl={bookingMenuAnchor} open={Boolean(bookingMenuAnchor)} onClose={handleMenuClose}>
        {selectedBooking?.status === 'confirmed' && (
          <MenuItem onClick={() => handleBookingStatusUpdate('in_progress')}>
            <PlayArrow sx={{ mr: 1 }} /> {t('dashboard:actions.start_service')}
          </MenuItem>
        )}
        {selectedBooking?.status === 'in_progress' && (
          <MenuItem onClick={() => handleBookingStatusUpdate('completed')}>
            <CheckCircle sx={{ mr: 1 }} /> {t('dashboard:actions.mark_complete')}
          </MenuItem>
        )}
        {selectedBooking && !['completed', 'cancelled'].includes(selectedBooking.status) && (
          <MenuItem onClick={handleMessageCustomer}>
            <Chat sx={{ mr: 1 }} /> {t('dashboard:actions.message_customer')}
          </MenuItem>
        )}
        <MenuItem onClick={handleMenuClose}>
          <Visibility sx={{ mr: 1 }} /> {t('dashboard:actions.view_details')}
        </MenuItem>
      </Menu>

      {/* Profile edit dialog */}
      <Dialog open={profileDialogOpen} onClose={() => setProfileDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontFamily: tokens.font.display, fontWeight: 500 }}>
          {t('dashboard:dialogs.edit_profile_title')}
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>{t('dashboard:dialogs.edit_profile_info')}</Alert>
          <Typography variant="body2">{t('dashboard:dialogs.edit_profile_desc')}</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setProfileDialogOpen(false)} sx={{ borderRadius: tokens.radius.full }}>
            {t('dashboard:dialogs.close')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Availability dialog */}
      <Dialog open={availabilityDialogOpen} onClose={() => setAvailabilityDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontFamily: tokens.font.display, fontWeight: 500 }}>
          Disponibilidade Semanal
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Defina seus horários de trabalho. Clientes só poderão agendar durante os horários disponíveis.
          </Typography>
          <Stack spacing={1.5}>
            {DAYS.map((day) => (
              <Box key={day} sx={{
                display: 'grid',
                gridTemplateColumns: '130px 1fr',
                alignItems: 'center',
                gap: 2,
                p: 1.5,
                borderRadius: tokens.radius.sm,
                bgcolor: availability[day].available
                  ? (isDark ? alpha(tokens.color.earth, 0.08) : alpha(tokens.color.earth, 0.04))
                  : 'transparent',
                opacity: availability[day].available ? 1 : 0.5,
              }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={availability[day].available}
                      onChange={(e) => setAvailability(prev => ({
                        ...prev, [day]: { ...prev[day], available: e.target.checked }
                      }))}
                      size="small"
                    />
                  }
                  label={<Typography variant="body2" sx={{ textTransform: 'capitalize', fontWeight: 500 }}>{{ monday: 'Segunda', tuesday: 'Terça', wednesday: 'Quarta', thursday: 'Quinta', friday: 'Sexta', saturday: 'Sábado', sunday: 'Domingo' }[day] ?? day}</Typography>}
                />
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <TextField
                    type="time" size="small"
                    value={availability[day].start}
                    disabled={!availability[day].available}
                    onChange={(e) => setAvailability(prev => ({ ...prev, [day]: { ...prev[day], start: e.target.value } }))}
                    inputProps={{ step: 1800 }}
                    sx={{ width: 110 }}
                  />
                  <Typography variant="body2" color="text.secondary">até</Typography>
                  <TextField
                    type="time" size="small"
                    value={availability[day].end}
                    disabled={!availability[day].available}
                    onChange={(e) => setAvailability(prev => ({ ...prev, [day]: { ...prev[day], end: e.target.value } }))}
                    inputProps={{ step: 1800 }}
                    sx={{ width: 110 }}
                  />
                </Box>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAvailabilityDialogOpen(false)} sx={{ borderRadius: tokens.radius.full }}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={() => updateAvailabilityMutation.mutate(availability)}
            disabled={updateAvailabilityMutation.isPending}
            sx={{
              bgcolor: tokens.color.earth,
              '&:hover': { bgcolor: tokens.color.earthLight },
              borderRadius: tokens.radius.full,
            }}
          >
            {updateAvailabilityMutation.isPending ? 'Salvando...' : 'Salvar Disponibilidade'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProviderDashboardPage;
