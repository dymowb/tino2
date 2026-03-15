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
import { apiService, User } from '../../services/api';

// ── Extended user type with admin-only fields ─────────────────────────
interface AdminUser extends User {
  isActive: boolean;
  suspensionReason: string | null;
  suspensionComment: string | null;
  suspendedUntil: string | null;
}

// ── Suspension reasons ────────────────────────────────────────────────
const SUSPENSION_REASONS = [
  { key: 'fraud',          label: 'Fraud or scam attempt' },
  { key: 'harassment',     label: 'Harassment or threatening behavior' },
  { key: 'fake_reviews',   label: 'Fake reviews / ratings manipulation' },
  { key: 'payment_abuse',  label: 'Payment disputes / chargeback abuse' },
  { key: 'tos_violation',  label: 'Terms of service violation' },
  { key: 'other',          label: 'Other (requires comment)' },
] as const;

type SuspensionReasonKey = typeof SUSPENSION_REASONS[number]['key'];

// ── Duration presets ──────────────────────────────────────────────────
const DURATION_PRESETS = [
  { value: '1d',        label: '1 day' },
  { value: '7d',        label: '7 days' },
  { value: '30d',       label: '30 days' },
  { value: 'permanent', label: 'Permanent' },
  { value: 'custom',    label: 'Custom date' },
] as const;

type DurationPreset = typeof DURATION_PRESETS[number]['value'];

function presetToDate(preset: DurationPreset): string | null {
  const now = new Date();
  if (preset === 'permanent') return null;
  if (preset === '1d')  { now.setDate(now.getDate() + 1);  return now.toISOString(); }
  if (preset === '7d')  { now.setDate(now.getDate() + 7);  return now.toISOString(); }
  if (preset === '30d') { now.setDate(now.getDate() + 30); return now.toISOString(); }
  return null; // 'custom' — caller provides date separately
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
  customDate: string; // ISO date string for custom picker
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
  const isValid = state.reason !== '' && (state.reason !== 'other' || state.comment.trim() !== '');

  return (
    <Dialog open={state.open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Suspend {state.user?.firstName} {state.user?.lastName}
      </DialogTitle>

      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* Reason */}
          <FormControl fullWidth>
            <InputLabel>Reason</InputLabel>
            <Select
              value={state.reason}
              label="Reason"
              onChange={e => onChange({ reason: e.target.value as SuspensionReasonKey })}
            >
              {SUSPENSION_REASONS.map(r => (
                <MenuItem key={r.key} value={r.key}>{r.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Comment */}
          <TextField
            label="Additional comment"
            multiline
            rows={3}
            value={state.comment}
            onChange={e => onChange({ comment: e.target.value })}
            required={state.reason === 'other'}
            helperText={state.reason === 'other' ? 'Required for "Other"' : 'Optional'}
          />

          {/* Duration */}
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Duration</Typography>
            <RadioGroup
              row
              value={state.duration}
              onChange={e => onChange({ duration: e.target.value as DurationPreset })}
            >
              {DURATION_PRESETS.map(p => (
                <FormControlLabel key={p.value} value={p.value} control={<Radio size="small" />} label={p.label} />
              ))}
            </RadioGroup>

            {state.duration === 'custom' && (
              <TextField
                type="date"
                label="Suspend until"
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
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          color="error"
          onClick={onConfirm}
          disabled={!isValid || isLoading}
        >
          {isLoading ? 'Suspending…' : 'Confirm Suspension'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ── Page ──────────────────────────────────────────────────────────────
const AdminUsersPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [page, setPage]         = useState(0); // MUI TablePagination is 0-indexed
  const [search, setSearch]     = useState('');
  const [filters, setFilters]   = useState<UserFilters>({ userType: '', isActive: null });
  const [suspendDialog, setSuspendDialog] = useState<SuspendDialogState>(INITIAL_SUSPEND_DIALOG);

  // ── Fetch users ───────────────────────────────────────────────────
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users', page, search, filters],
    queryFn: () => apiService.getAdminUsers({
      page: page + 1, // API is 1-indexed
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
  if (error) return <Alert severity="error">Failed to load users.</Alert>;

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 3 }}>User Management</Typography>

      {/* ── Filters ── */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <TextField
          label="Search name or email"
          size="small"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          sx={{ width: 280 }}
        />

        <FormControl size="small" sx={{ width: 160 }}>
          <InputLabel>Role</InputLabel>
          <Select
            value={filters.userType}
            label="Role"
            onChange={e => { setFilters(f => ({ ...f, userType: e.target.value as UserFilters['userType'] })); setPage(0); }}
          >
            <MenuItem value="">All roles</MenuItem>
            <MenuItem value="customer">Customer</MenuItem>
            <MenuItem value="provider">Provider</MenuItem>
            <MenuItem value="admin">Admin</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ width: 160 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={filters.isActive === null ? '' : String(filters.isActive)}
            label="Status"
            onChange={e => {
              const v = e.target.value;
              setFilters(f => ({ ...f, isActive: v === '' ? null : v === 'true' }));
              setPage(0);
            }}
          >
            <MenuItem value="">All statuses</MenuItem>
            <MenuItem value="true">Active</MenuItem>
            <MenuItem value="false">Suspended</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {/* ── Table ── */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Joined</TableCell>
              <TableCell align="right">Actions</TableCell>
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
                  <Chip label={user.userType} size="small" variant="outlined" />
                </TableCell>
                <TableCell>
                  {user.isActive
                    ? <Chip label="Active"    size="small" color="success" />
                    : <Chip label="Suspended" size="small" color="error"   />
                  }
                </TableCell>
                <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                <TableCell align="right">
                  {user.isActive ? (
                    <Tooltip title="Suspend user">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setSuspendDialog({ ...INITIAL_SUSPEND_DIALOG, open: true, user })}
                      >
                        <Block fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Tooltip title="Reactivate user">
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
