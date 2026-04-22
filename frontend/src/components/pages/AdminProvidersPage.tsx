import React, { useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Paper, Chip, IconButton, Tooltip, TablePagination, CircularProgress,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  FormControlLabel, Checkbox, Stack,
} from '@mui/material';
import { CheckCircle, Cancel } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiService, Provider, User } from '../../services/api';

// ── Extended types (backend includes fields not in the frontend Provider type) ──
interface PendingProvider extends Provider {
  createdAt: string;
  user: User;
}

// ── Dialog state ──────────────────────────────────────────────────────────────
interface ApproveDialogState {
  open: boolean;
  provider: PendingProvider | null;
  isBackgroundChecked: boolean;
  isInsured: boolean;
  notes: string;
}

interface RejectDialogState {
  open: boolean;
  provider: PendingProvider | null;
  notes: string;
}

const INITIAL_APPROVE: ApproveDialogState = {
  open: false, provider: null, isBackgroundChecked: false, isInsured: false, notes: '',
};

const INITIAL_REJECT: RejectDialogState = {
  open: false, provider: null, notes: '',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function providerLocation(provider: PendingProvider): string {
  if (!provider.location) return '—';
  if (typeof provider.location === 'string') return provider.location;
  const { city, state } = provider.location;
  return [city, state].filter(Boolean).join(', ') || '—';
}

// ── Page ──────────────────────────────────────────────────────────────────────
const AdminProvidersPage: React.FC = () => {
  const { t } = useTranslation('admin');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [approveDialog, setApproveDialog] = useState<ApproveDialogState>(INITIAL_APPROVE);
  const [rejectDialog, setRejectDialog]   = useState<RejectDialogState>(INITIAL_REJECT);

  // ── Fetch pending providers ────────────────────────────────────────────────
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-pending-providers', page],
    queryFn: () => apiService.getPendingProviders({ page: page + 1, limit: 20 }),
  });

  const providers: PendingProvider[] = data?.providers ?? [];
  const total: number                = data?.pagination?.total ?? 0;

  // ── Mutation ───────────────────────────────────────────────────────────────
  const verifyMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof apiService.verifyProvider>[1] }) =>
      apiService.verifyProvider(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-pending-providers'] });
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
      setApproveDialog(INITIAL_APPROVE);
      setRejectDialog(INITIAL_REJECT);
    },
  });

  const handleApprove = () => {
    if (!approveDialog.provider) return;
    verifyMutation.mutate({
      id: approveDialog.provider.id,
      payload: {
        approved: true,
        notes: approveDialog.notes || undefined,
        isBackgroundChecked: approveDialog.isBackgroundChecked,
        isInsured: approveDialog.isInsured,
      },
    });
  };

  const handleReject = () => {
    if (!rejectDialog.provider || !rejectDialog.notes.trim()) return;
    verifyMutation.mutate({
      id: rejectDialog.provider.id,
      payload: { approved: false, notes: rejectDialog.notes },
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (error) return <Alert severity="error">{t('providers.error')}</Alert>;

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 1 }}>{t('providers.title')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('providers.applications_awaiting', { count: total })}
      </Typography>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('providers.table.business')}</TableCell>
              <TableCell>{t('providers.table.owner')}</TableCell>
              <TableCell>{t('providers.table.location')}</TableCell>
              <TableCell>{t('providers.table.services')}</TableCell>
              <TableCell align="center">{t('providers.table.background')}</TableCell>
              <TableCell align="center">{t('providers.table.insured')}</TableCell>
              <TableCell>{t('providers.table.applied')}</TableCell>
              <TableCell align="right">{t('providers.table.actions')}</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={28} />
                </TableCell>
              </TableRow>
            ) : providers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  {t('providers.empty')}
                </TableCell>
              </TableRow>
            ) : providers.map(p => (
              <TableRow key={p.id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight="medium">{p.businessName || '—'}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{p.user?.firstName} {p.user?.lastName}</Typography>
                  <Typography variant="caption" color="text.secondary">{p.user?.email}</Typography>
                </TableCell>
                <TableCell>{providerLocation(p)}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {(p.services ?? []).slice(0, 3).map(s => (
                      <Chip key={s} label={s} size="small" variant="outlined" />
                    ))}
                    {(p.services ?? []).length > 3 && (
                      <Chip label={`+${p.services.length - 3}`} size="small" />
                    )}
                  </Box>
                </TableCell>
                <TableCell align="center">
                  {p.isBackgroundChecked
                    ? <Chip label={t('providers.yes')} size="small" color="success" />
                    : <Chip label={t('providers.no')}  size="small" variant="outlined" />}
                </TableCell>
                <TableCell align="center">
                  {p.isInsured
                    ? <Chip label={t('providers.yes')} size="small" color="success" />
                    : <Chip label={t('providers.no')}  size="small" variant="outlined" />}
                </TableCell>
                <TableCell>{new Date(p.createdAt).toLocaleDateString()}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Tooltip title={t('providers.approve_tooltip')}>
                      <IconButton
                        size="small"
                        color="success"
                        onClick={() => setApproveDialog({ ...INITIAL_APPROVE, open: true, provider: p })}
                      >
                        <CheckCircle fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('providers.reject_tooltip')}>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setRejectDialog({ ...INITIAL_REJECT, open: true, provider: p })}
                      >
                        <Cancel fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <TablePagination
          component="div"
          count={total}
          page={page}
          rowsPerPage={20}
          rowsPerPageOptions={[20]}
          onPageChange={(_, newPage) => setPage(newPage)}
        />
      </TableContainer>

      {/* ── Approve dialog ── */}
      <Dialog open={approveDialog.open} onClose={() => setApproveDialog(INITIAL_APPROVE)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('providers.approve_dialog.title', { name: approveDialog.provider?.businessName })}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t('providers.approve_dialog.confirm_text')}
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={approveDialog.isBackgroundChecked}
                  onChange={e => setApproveDialog(s => ({ ...s, isBackgroundChecked: e.target.checked }))}
                />
              }
              label={t('providers.approve_dialog.background_check')}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={approveDialog.isInsured}
                  onChange={e => setApproveDialog(s => ({ ...s, isInsured: e.target.checked }))}
                />
              }
              label={t('providers.approve_dialog.insurance_verified')}
            />
            <TextField
              label={t('providers.approve_dialog.admin_notes')}
              multiline
              rows={2}
              value={approveDialog.notes}
              onChange={e => setApproveDialog(s => ({ ...s, notes: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApproveDialog(INITIAL_APPROVE)}>{t('providers.approve_dialog.cancel')}</Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleApprove}
            disabled={verifyMutation.isPending}
          >
            {verifyMutation.isPending ? t('providers.approve_dialog.approving') : t('providers.approve_dialog.approve')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Reject dialog ── */}
      <Dialog open={rejectDialog.open} onClose={() => setRejectDialog(INITIAL_REJECT)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('providers.reject_dialog.title', { name: rejectDialog.provider?.businessName })}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t('providers.reject_dialog.reason_text')}
            </Typography>
            <TextField
              label={t('providers.reject_dialog.reason_label')}
              multiline
              rows={3}
              required
              value={rejectDialog.notes}
              onChange={e => setRejectDialog(s => ({ ...s, notes: e.target.value }))}
              helperText={t('providers.reject_dialog.reason_required')}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialog(INITIAL_REJECT)}>{t('providers.reject_dialog.cancel')}</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleReject}
            disabled={!rejectDialog.notes.trim() || verifyMutation.isPending}
          >
            {verifyMutation.isPending ? t('providers.reject_dialog.rejecting') : t('providers.reject_dialog.reject')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminProvidersPage;
