import React, { useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Paper, Chip, IconButton, Tooltip, TablePagination, CircularProgress,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Stack, Rating,
} from '@mui/material';
import { CheckCircle, Delete, Flag } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService, User, Provider } from '../../services/api';

// ── Types ─────────────────────────────────────────────────────────────────────
interface FlaggedReview {
  id: string;
  rating: number;
  comment: string;
  flagReason: string | null;
  createdAt: string;
  customer: User;
  provider: Provider & { user?: User };
}

type ModerationAction = 'approve' | 'delete' | 'keep_flagged';

interface ActionDialogState {
  open: boolean;
  review: FlaggedReview | null;
  action: ModerationAction | null;
  reason: string;
}

const INITIAL_DIALOG: ActionDialogState = {
  open: false, review: null, action: null, reason: '',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const ACTION_CONFIG: Record<ModerationAction, { label: string; color: 'success' | 'error' | 'warning'; confirmLabel: string }> = {
  approve:      { label: 'Approve',       color: 'success', confirmLabel: 'Approve Review' },
  delete:       { label: 'Delete',        color: 'error',   confirmLabel: 'Delete Review' },
  keep_flagged: { label: 'Keep Flagged',  color: 'warning', confirmLabel: 'Keep Flagged' },
};

// ── Page ──────────────────────────────────────────────────────────────────────
const AdminReviewsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [page, setPage]           = useState(0);
  const [dialog, setDialog]       = useState<ActionDialogState>(INITIAL_DIALOG);

  // ── Fetch flagged reviews ──────────────────────────────────────────────────
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-flagged-reviews', page],
    queryFn: () => apiService.getFlaggedReviews({ page: page + 1, limit: 20 }),
  });

  const reviews: FlaggedReview[] = data?.reviews ?? [];
  const total: number            = data?.pagination?.total ?? 0;

  // ── Mutation ───────────────────────────────────────────────────────────────
  const moderateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof apiService.moderateReview>[1] }) =>
      apiService.moderateReview(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-flagged-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
      setDialog(INITIAL_DIALOG);
    },
  });

  const openDialog = (review: FlaggedReview, action: ModerationAction) =>
    setDialog({ open: true, review, action, reason: '' });

  const handleConfirm = () => {
    if (!dialog.review || !dialog.action) return;
    moderateMutation.mutate({
      id: dialog.review.id,
      payload: {
        action: dialog.action,
        reason: dialog.reason || undefined,
      },
    });
  };

  const actionCfg = dialog.action ? ACTION_CONFIG[dialog.action] : null;
  const reasonRequired = dialog.action === 'keep_flagged';

  // ── Render ─────────────────────────────────────────────────────────────────
  if (error) return <Alert severity="error">Failed to load flagged reviews.</Alert>;

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 1 }}>Review Moderation</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {total} flagged review{total !== 1 ? 's' : ''} awaiting moderation
      </Typography>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Customer</TableCell>
              <TableCell>Provider</TableCell>
              <TableCell align="center">Rating</TableCell>
              <TableCell sx={{ maxWidth: 300 }}>Review</TableCell>
              <TableCell>Flag Reason</TableCell>
              <TableCell>Date</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={28} />
                </TableCell>
              </TableRow>
            ) : reviews.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  No flagged reviews — all clear!
                </TableCell>
              </TableRow>
            ) : reviews.map(r => (
              <TableRow key={r.id} hover>
                <TableCell>
                  <Typography variant="body2">{r.customer?.firstName} {r.customer?.lastName}</Typography>
                  <Typography variant="caption" color="text.secondary">{r.customer?.email}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{r.provider?.businessName || '—'}</Typography>
                </TableCell>
                <TableCell align="center">
                  <Rating value={r.rating} readOnly size="small" />
                </TableCell>
                <TableCell sx={{ maxWidth: 300 }}>
                  <Typography variant="body2" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280 }}>
                    {r.comment || <em>No comment</em>}
                  </Typography>
                </TableCell>
                <TableCell>
                  {r.flagReason
                    ? <Chip label={r.flagReason} size="small" color="warning" />
                    : <Typography variant="caption" color="text.secondary">—</Typography>
                  }
                </TableCell>
                <TableCell>{new Date(r.createdAt).toLocaleDateString()}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    <Tooltip title="Approve (unflag)">
                      <IconButton size="small" color="success" onClick={() => openDialog(r, 'approve')}>
                        <CheckCircle fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete review">
                      <IconButton size="small" color="error" onClick={() => openDialog(r, 'delete')}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Keep flagged">
                      <IconButton size="small" color="warning" onClick={() => openDialog(r, 'keep_flagged')}>
                        <Flag fontSize="small" />
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

      {/* ── Moderation dialog ── */}
      <Dialog open={dialog.open} onClose={() => setDialog(INITIAL_DIALOG)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {actionCfg?.label} Review
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {dialog.review && (
              <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                  <Rating value={dialog.review.rating} readOnly size="small" />
                  <Typography variant="caption" color="text.secondary">
                    by {dialog.review.customer?.firstName} {dialog.review.customer?.lastName}
                  </Typography>
                </Stack>
                <Typography variant="body2">{dialog.review.comment || <em>No comment</em>}</Typography>
              </Box>
            )}

            <TextField
              label={reasonRequired ? 'Reason (required)' : 'Reason (optional)'}
              multiline
              rows={2}
              required={reasonRequired}
              value={dialog.reason}
              onChange={e => setDialog(s => ({ ...s, reason: e.target.value }))}
              helperText={
                dialog.action === 'delete'       ? 'Reason will be logged for audit purposes' :
                dialog.action === 'keep_flagged' ? 'Describe why this review remains under review' :
                'Optional note'
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(INITIAL_DIALOG)}>Cancel</Button>
          <Button
            variant="contained"
            color={actionCfg?.color ?? 'primary'}
            onClick={handleConfirm}
            disabled={(reasonRequired && !dialog.reason.trim()) || moderateMutation.isPending}
          >
            {moderateMutation.isPending ? 'Processing…' : actionCfg?.confirmLabel}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminReviewsPage;
