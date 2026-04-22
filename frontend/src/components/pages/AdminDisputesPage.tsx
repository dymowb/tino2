import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow,
  Chip, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, RadioGroup, FormControlLabel, Radio, FormLabel,
  CircularProgress, Alert, Tooltip,
} from '@mui/material';
import { Gavel, Person, Business, AttachMoney } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import apiService from '../../services/api';

interface DisputeBooking {
  id: string;
  serviceType: string;
  totalAmount: number;
  disputeReason: string;
  disputedAt: string;
  disputeStatus: 'open' | 'resolved';
  disputeResolution: string | null;
  adminNotes: string | null;
  stripePaymentIntentId: string;
  customer: { id: string; firstName: string; lastName: string; email: string };
  provider: { id: string; businessName: string; user: { firstName: string; lastName: string } };
}

const AdminDisputesPage: React.FC = () => {
  const { t } = useTranslation('admin');
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<DisputeBooking | null>(null);
  const [decision, setDecision] = useState<'capture' | 'refund'>('capture');
  const [adminNotes, setAdminNotes] = useState('');
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-disputes', filter],
    queryFn: async () => {
      const params = filter !== 'all' ? `?disputeStatus=${filter}` : '';
      const r = await apiService.get(`/admin/disputes${params}`);
      return r.data.data as { disputes: DisputeBooking[]; pagination: any };
    },
  });

  const disputes = data?.disputes ?? [];

  const openResolve = (d: DisputeBooking) => {
    setSelected(d);
    setDecision('capture');
    setAdminNotes('');
    setError('');
  };

  const handleResolve = async () => {
    if (!selected) return;
    setResolving(true);
    setError('');
    try {
      await apiService.put(`/admin/disputes/${selected.id}/resolve`, { decision, adminNotes });
      queryClient.invalidateQueries({ queryKey: ['admin-disputes'] });
      setSelected(null);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to resolve dispute');
    } finally {
      setResolving(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <Gavel />
        <Typography variant="h4">{t('disputes.title')}</Typography>
        <Chip label={t('disputes.total_label', { count: data?.pagination?.total ?? 0 })} sx={{ ml: 1 }} />
      </Box>

      {/* Filter tabs */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        {(['open', 'resolved', 'all'] as const).map(f => (
          <Button key={f} variant={filter === f ? 'contained' : 'outlined'} size="small"
            onClick={() => setFilter(f)}>
            {t(`disputes.filter.${f}`)}
          </Button>
        ))}
      </Box>

      {isLoading ? (
        <CircularProgress />
      ) : disputes.length === 0 ? (
        <Alert severity="success">
          {t('disputes.no_disputes', { filter: filter !== 'all' ? t(`disputes.filter.${filter}`).toLowerCase() : '' })}
        </Alert>
      ) : (
        <Paper>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('disputes.table.booking')}</TableCell>
                <TableCell>{t('disputes.table.service')}</TableCell>
                <TableCell>{t('disputes.table.amount')}</TableCell>
                <TableCell>{t('disputes.table.customer')}</TableCell>
                <TableCell>{t('disputes.table.provider')}</TableCell>
                <TableCell>{t('disputes.table.dispute_reason')}</TableCell>
                <TableCell>{t('disputes.table.raised')}</TableCell>
                <TableCell>{t('disputes.table.status')}</TableCell>
                <TableCell>{t('disputes.table.action')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {disputes.map((d: DisputeBooking) => (
                <TableRow key={d.id} hover>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{d.id.slice(0, 8)}…</TableCell>
                  <TableCell>{d.serviceType}</TableCell>
                  <TableCell>R${Number(d.totalAmount).toFixed(2)}</TableCell>
                  <TableCell>
                    <Tooltip title={d.customer?.email}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Person fontSize="small" />
                        {d.customer?.firstName} {d.customer?.lastName}
                      </Box>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Business fontSize="small" />
                      {d.provider?.businessName || `${d.provider?.user?.firstName} ${d.provider?.user?.lastName}`}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ maxWidth: 200 }}>
                    <Tooltip title={d.disputeReason || ''}>
                      <Typography variant="body2" noWrap>{d.disputeReason || '—'}</Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>{d.disputedAt ? new Date(d.disputedAt).toLocaleDateString() : '—'}</TableCell>
                  <TableCell>
                    <Chip
                      label={d.disputeStatus === 'resolved'
                        ? (d.disputeResolution === 'provider_favor'
                            ? t('disputes.status.provider_won')
                            : t('disputes.status.customer_won'))
                        : t('disputes.status.open')}
                      color={d.disputeStatus === 'resolved' ? 'default' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {d.disputeStatus === 'open' ? (
                      <Button size="small" variant="contained" color="warning"
                        startIcon={<Gavel />} onClick={() => openResolve(d)}>
                        {t('disputes.resolve_button')}
                      </Button>
                    ) : (
                      <Tooltip title={d.adminNotes || t('disputes.no_notes')}>
                        <Typography variant="caption" color="text.secondary">{t('disputes.resolved_label')}</Typography>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* Resolve dialog */}
      <Dialog open={!!selected} onClose={() => setSelected(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Gavel /> {t('disputes.resolve_dialog.title')}
        </DialogTitle>
        <DialogContent>
          {selected && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <Alert severity="warning" icon={<AttachMoney />}>
                {t('disputes.resolve_dialog.hold_amount', {
                  amount: Number(selected.totalAmount).toFixed(2),
                  service: selected.serviceType,
                })}
              </Alert>

              <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('disputes.resolve_dialog.dispute_reason_label')}
                </Typography>
                <Typography>{selected.disputeReason || t('disputes.resolve_dialog.no_reason')}</Typography>
              </Box>

              <FormLabel>{t('disputes.resolve_dialog.decision_label')}</FormLabel>
              <RadioGroup value={decision} onChange={e => setDecision(e.target.value as any)}>
                <FormControlLabel value="capture" control={<Radio />}
                  label={t('disputes.resolve_dialog.capture_label')} />
                <FormControlLabel value="refund" control={<Radio />}
                  label={t('disputes.resolve_dialog.refund_label')} />
              </RadioGroup>

              <TextField
                label={t('disputes.resolve_dialog.admin_notes_label')}
                multiline rows={3} fullWidth
                value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                placeholder={t('disputes.resolve_dialog.admin_notes_placeholder')}
              />

              {error && <Alert severity="error">{error}</Alert>}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)} disabled={resolving}>
            {t('disputes.resolve_dialog.cancel')}
          </Button>
          <Button variant="contained" color={decision === 'capture' ? 'success' : 'error'}
            onClick={handleResolve} disabled={resolving}
            startIcon={resolving ? <CircularProgress size={16} /> : <Gavel />}>
            {resolving
              ? t('disputes.resolve_dialog.processing')
              : decision === 'capture'
                ? t('disputes.resolve_dialog.release_payment')
                : t('disputes.resolve_dialog.refund_customer')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminDisputesPage;
