import React, { useState } from 'react';
import {
  Box, Typography, TextField, Select, MenuItem, FormControl, InputLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Chip, IconButton, Tooltip, TablePagination, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, RadioGroup,
  FormControlLabel, Radio, Stack,
} from '@mui/material';
import { Block, CheckCircle } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiService, User } from '../../services/api';

// ── Extended user type with admin-only fields ─────────────────────────
interface AdminUser extends User {
  isActive: boolean;
  suspensionReason: string | null;
  suspensionComment: string | null;
  suspendedUntil: string | null;
}

// ── Suspension reason keys ────────────────────────────────────────────
const SUSPENSION_REASON_KEYS = ['fraud', 'harassment', 'fake_reviews', 'payment_abuse', 'tos_violation', 'other'] as const;
type SuspensionReasonKey = typeof SUSPENSION_REASON_KEYS[number];

// ── Duration preset keys ──────────────────────────────────────────────
const DURATION_PRESET_KEYS = ['1d', '7d', '30d', 'permanent', 'custom'] as const;
type DurationPreset = typeof DURATION_PRESET_KEYS[number];

function presetToDate(preset: DurationPreset): string | null {
  const now = new Date();
  if (preset === 'permanent') return null;
  if (preset === '1d')  { now.setDate(now.getDate() + 1);  return now.toISOString(); }
  if (preset === '7d')  { now.setDate(now.getDate() + 7);  return now.toISOString(); }
  if (preset === '30d') { now.setDate(now.getDate() + 30); return now.toISOString(); }
  return null;
}

// ── State interfaces ──────────────────────────────────────────────────
interface UserFilters {
  userType: 'customer' | 'provider' | 'admin' | '';
  isActive: boolean | null;
}

interface SuspendDialogState {
  open: boolean;
  user: AdminUser | null;
  reason: SuspensionReasonKey | '';
  comment: string;
  duration: DurationPreset;
  customDate: string;
}

const INITIAL_SUSPEND_DIALOG: SuspendDialogState = {
  open: false, user: null, reason: '', comment: '', duration: '7d', customDate: '',
};

// ── Suspension Dialog ─────────────────────────────────────────────────
interface SuspendDialogProps {
  state: SuspendDialogState;
  onChange: (patch: Partial<SuspendDialogState>) => void;
  onConfirm: () => void;
  onClose: () => void;
  isLoading: boolean;
}

const SuspensionDialog: React.FC<SuspendDialogProps> = ({ state, onChange, onConfirm, onClose, isLoading }) => {
  const { t } = useTranslation('admin');
  const isValid = state.reason !== '' && (state.reason !== 'other' || state.comment.trim() !== '');

  return (
    <Dialog open={state.open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {t('users.suspend_dialog.title', { name: `${state.user?.firstName} ${state.user?.lastName}` })}
      </DialogTitle>

      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* Reason */}
          <FormControl fullWidth>
            <InputLabel>{t('users.suspend_dialog.reason_label')}</InputLabel>
            <Select
              value={state.reason}
              label={t('users.suspend_dialog.reason_label')}
              onChange={e => onChange({ reason: e.target.value as SuspensionReasonKey })}
            >
              {SUSPENSION_REASON_KEYS.map(key => (
                <MenuItem key={key} value={key}>{t(`users.suspend_dialog.reasons.${key}`)}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Comment */}
          <TextField
            label={t('users.suspend_dialog.comment_label')}
            multiline
            rows={3}
            value={state.comment}
            onChange={e => onChange({ comment: e.target.value })}
            required={state.reason === 'other'}
            helperText={state.reason === 'other'
              ? t('users.suspend_dialog.comment_required_helper')
              : t('users.suspend_dialog.comment_optional_helper')}
          />

          {/* Duration */}
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t('users.suspend_dialog.duration_label')}
            </Typography>
            <RadioGroup
              row
              value={state.duration}
              onChange={e => onChange({ duration: e.target.value as DurationPreset })}
            >
              {DURATION_PRESET_KEYS.map(key => (
                <FormControlLabel
                  key={key}
                  value={key}
                  control={<Radio size="small" />}
                  label={t(`users.suspend_dialog.durations.${key}`)}
                />
              ))}
            </RadioGroup>

            {state.duration === 'custom' && (
              <TextField
                type="date"
                label={t('users.suspend_dialog.custom_date_label')}
                value={state.customDate}
                onChange={e => onChange({ customDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: new Date().toISOString().split('T')[0] }}
                sx={{ mt: 1 }}
                size="small"
              />
            )}
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{t('users.suspend_dialog.cancel')}</Button>
        <Button
          variant="contained"
          color="error"
          onClick={onConfirm}
          disabled={!isValid || isLoading}
        >
          {isLoading ? t('users.suspend_dialog.confirming') : t('users.suspend_dialog.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Page ──────────────────────────────────────────────────────────────
const AdminUsersPage: React.FC = () => {
  const { t } = useTranslation('admin');
  const queryClient = useQueryClient();

  const [page, setPage]         = useState(0);
  const [search, setSearch]     = useState('');
  const [filters, setFilters]   = useState<UserFilters>({ userType: '', isActive: null });
  const [suspendDialog, setSuspendDialog] = useState<SuspendDialogState>(INITIAL_SUSPEND_DIALOG);

  // ── Fetch users ───────────────────────────────────────────────────
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users', page, search, filters],
    queryFn: () => apiService.getAdminUsers({
      page: page + 1,
      limit: 20,
      search: search || undefined,
      userType: filters.userType || undefined,
      isActive: filters.isActive ?? undefined,
    }),
  });

  const users: AdminUser[] = data?.users ?? [];
  const total: number      = data?.pagination?.total ?? 0;

  // ── Suspend / reactivate mutation ─────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: Parameters<typeof apiService.updateUserStatus>[1] }) =>
      apiService.updateUserStatus(userId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setSuspendDialog(INITIAL_SUSPEND_DIALOG);
    },
  });

  const handleConfirmSuspend = () => {
    if (!suspendDialog.user || !suspendDialog.reason) return;

    const suspendedUntil =
      suspendDialog.duration === 'custom'
        ? suspendDialog.customDate
          ? new Date(suspendDialog.customDate).toISOString()
          : null
        : presetToDate(suspendDialog.duration);

    statusMutation.mutate({
      userId: suspendDialog.user.id,
      payload: {
        isActive: false,
        suspensionReason: suspendDialog.reason,
        suspensionComment: suspendDialog.comment || undefined,
        suspendedUntil,
      },
    });
  };

  const handleReactivate = (user: AdminUser) => {
    statusMutation.mutate({ userId: user.id, payload: { isActive: true } });
  };

  // ── Render ────────────────────────────────────────────────────────
  if (error) return <Alert severity="error">{t('users.error')}</Alert>;

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 3 }}>{t('users.title')}</Typography>

      {/* ── Filters ── */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <TextField
          label={t('users.search_placeholder')}
          size="small"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          sx={{ width: 280 }}
        />

        <FormControl size="small" sx={{ width: 160 }}>
          <InputLabel>{t('users.role_label')}</InputLabel>
          <Select
            value={filters.userType}
            label={t('users.role_label')}
            onChange={e => { setFilters(f => ({ ...f, userType: e.target.value as UserFilters['userType'] })); setPage(0); }}
          >
            <MenuItem value="">{t('users.all_roles')}</MenuItem>
            <MenuItem value="customer">{t('users.customer')}</MenuItem>
            <MenuItem value="provider">{t('users.provider')}</MenuItem>
            <MenuItem value="admin">{t('users.admin')}</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ width: 160 }}>
          <InputLabel>{t('users.status_label')}</InputLabel>
          <Select
            value={filters.isActive === null ? '' : String(filters.isActive)}
            label={t('users.status_label')}
            onChange={e => {
              const v = e.target.value;
              setFilters(f => ({ ...f, isActive: v === '' ? null : v === 'true' }));
              setPage(0);
            }}
          >
            <MenuItem value="">{t('users.all_statuses')}</MenuItem>
            <MenuItem value="true">{t('users.active')}</MenuItem>
            <MenuItem value="false">{t('users.suspended')}</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {/* ── Table ── */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('users.table.name')}</TableCell>
              <TableCell>{t('users.table.email')}</TableCell>
              <TableCell>{t('users.table.role')}</TableCell>
              <TableCell>{t('users.table.status')}</TableCell>
              <TableCell>{t('users.table.joined')}</TableCell>
              <TableCell align="right">{t('users.table.actions')}</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={28} />
                </TableCell>
              </TableRow>
            ) : users.map(user => (
              <TableRow key={user.id} hover>
                <TableCell>{user.firstName} {user.lastName}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Chip label={t(`users.${user.userType}`, user.userType)} size="small" variant="outlined" />
                </TableCell>
                <TableCell>
                  {user.isActive
                    ? <Chip label={t('users.active')}    size="small" color="success" />
                    : <Chip label={t('users.suspended')} size="small" color="error"   />
                  }
                </TableCell>
                <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                <TableCell align="right">
                  {user.isActive ? (
                    <Tooltip title={t('users.suspend_tooltip')}>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setSuspendDialog({ ...INITIAL_SUSPEND_DIALOG, open: true, user })}
                      >
                        <Block fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Tooltip title={t('users.reactivate_tooltip')}>
                      <IconButton
                        size="small"
                        color="success"
                        onClick={() => handleReactivate(user)}
                        disabled={statusMutation.isPending}
                      >
                        <CheckCircle fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
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

      {/* ── Suspension dialog ── */}
      <SuspensionDialog
        state={suspendDialog}
        onChange={patch => setSuspendDialog(s => ({ ...s, ...patch }))}
        onConfirm={handleConfirmSuspend}
        onClose={() => setSuspendDialog(INITIAL_SUSPEND_DIALOG)}
        isLoading={statusMutation.isPending}
      />
    </Box>
  );
};

export default AdminUsersPage;
