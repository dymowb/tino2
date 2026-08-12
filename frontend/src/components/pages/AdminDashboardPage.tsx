import React from 'react';
import {
  Box, Typography, Grid, Card, CardContent,
  CircularProgress, Alert, Divider, List,
  ListItem, ListItemText, Chip,
} from '@mui/material';
import {
  People, Store, BookOnline, Flag, HourglassEmpty, TrendingUp, Star,
  TrendingDown, AccountBalance,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiService } from '../../services/api';
import { formatMoney } from '../../utils/money';

// ── Stat card component ──────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, color }) => (
  <Card>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" color="text.secondary">{label}</Typography>
          <Typography variant="h4" fontWeight="bold">{value}</Typography>
        </Box>
        <Box sx={{ color, opacity: 0.8 }}>{icon}</Box>
      </Box>
    </CardContent>
  </Card>
);

// ── Page ─────────────────────────────────────────────────────────────
const AdminDashboardPage: React.FC = () => {
  const { t } = useTranslation('admin');
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => apiService.getAdminDashboard(),
  });

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">{t('dashboard.error')}</Alert>;

  const stats = data?.statistics;
  const recent = data?.recentActivities;

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 3 }}>{t('dashboard.title')}</Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label={t('dashboard.stats.total_users')} value={stats?.totalUsers ?? '—'} icon={<People fontSize="large" />} color="primary.main" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label={t('dashboard.stats.total_providers')} value={stats?.totalProviders ?? '—'} icon={<Store fontSize="large" />} color="success.main" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label={t('dashboard.stats.total_bookings')} value={stats?.totalBookings ?? '—'} icon={<BookOnline fontSize="large" />} color="info.main" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label={t('dashboard.stats.flagged_reviews')} value={stats?.flaggedReviews ?? '—'} icon={<Flag fontSize="large" />} color="error.main" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label={t('dashboard.stats.pending_providers')} value={stats?.pendingProviders ?? '—'} icon={<HourglassEmpty fontSize="large" />} color="warning.main" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard label={t('dashboard.stats.active_bookings')} value={stats?.activeBookings ?? '—'} icon={<TrendingUp fontSize="large" />} color="secondary.main" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label={t('dashboard.stats.gross_revenue')}
            value={stats?.totalRevenue != null ? formatMoney(stats.totalRevenue) : '—'}
            icon={<TrendingUp fontSize="large" />}
            color="success.dark"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label={t('dashboard.stats.refunds')}
            value={stats?.totalRefunds != null ? formatMoney(stats.totalRefunds) : '—'}
            icon={<TrendingDown fontSize="large" />}
            color="error.main"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label={t('dashboard.stats.net_revenue')}
            value={stats?.netRevenue != null ? formatMoney(stats.netRevenue) : '—'}
            icon={<AccountBalance fontSize="large" />}
            color="primary.main"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label={t('dashboard.stats.average_rating')}
            value={stats?.averageRating != null
              ? `${stats.averageRating} (${stats.totalReviews} avaliações)`
              : '—'}
            icon={<Star fontSize="large" />}
            color="warning.main"
          />
        </Grid>
      </Grid>

      {/* Recent activity */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>{t('dashboard.recent_users')}</Typography>
              <Divider sx={{ mb: 1 }} />
              <List dense>
                {recent?.users?.map((u: any) => (
                  <ListItem key={u.id} disableGutters>
                    <ListItemText
                      primary={`${u.firstName} ${u.lastName}`}
                      secondary={u.email}
                    />
                    <Chip label={u.userType === 'customer' ? 'Cliente' : u.userType === 'provider' ? 'Prestador' : u.userType} size="small" variant="outlined" />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>{t('dashboard.recent_bookings')}</Typography>
              <Divider sx={{ mb: 1 }} />
              <List dense>
                {recent?.bookings?.map((b: any) => (
                  <ListItem key={b.id} disableGutters>
                    <ListItemText
                      primary={b.serviceType?.replace(/_/g, ' ')}
                      secondary={`${b.customer?.firstName} → ${b.provider?.businessName}`}
                    />
                    <Chip label={{ pending: 'Pendente', confirmed: 'Confirmada', in_progress: 'Em Andamento', completed: 'Concluída', cancelled: 'Cancelada' }[b.status as string] ?? b.status} size="small" />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default AdminDashboardPage;
