import React, { useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Paper, Chip, IconButton, Tooltip, TablePagination, CircularProgress,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
  Stack, Rating,
} from '@mui/material';
import { CheckCircle, Delete, Flag } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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

// ── Page ──────────────────────────────────────────────────────────────────────
const AdminReviewsPage: React.FC = () => {
  const { t } = useTranslation('admin');
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

  const reasonRequired = dialog.action === 'keep_flagged';

  const getActionColor = (action: ModerationAction | null): 'success' | 'error' | 'warning' | 'primary' => {
    if (action === 'approve') return 'success';
    if (action === 'delete') return 'error';
    if (action === 'keep_flagged') return 'warning';
    return 'primary';
  };

  const getConfirmLabel = (action: ModerationAction | null): string => {
    if (!action) return '';
    return t(`reviews.actions.${action === 'approve' ? 'approve_review' : action === 'delete' ? 'delete_review' : 'keep_flagged_confirm'}`);
  };

  const getDialogTitle = (action: ModerationAction | null): string => {
    if (!action) return '';
    return t(`reviews.actions.${action}`);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (error) return <Alert severity="error">{t('reviews.error')}</Alert>;

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 1 }}>{t('reviews.title')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('reviews.flagged_awaiting', { count: total })}
      </Typography>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('reviews.table.customer')}</TableCell>
              <TableCell>{t('reviews.table.provider')}</TableCell>
              <TableCell align="center">{t('reviews.table.rating')}</TableCell>
              <TableCell sx={{ maxWidth: 300 }}>{t('reviews.table.review')}</TableCell>
              <TableCell>{t('reviews.table.flag_reason')}</TableCell>
              <TableCell>{t('reviews.table.date')}</TableCell>
              <TableCell align="right">{t('reviews.table.actions')}</TableCell>
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
                  {t('reviews.empty')}
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
                    {r.comment || <em>{t('reviews.no_comment')}</em>}
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
                    <Tooltip title={t('reviews.approve_tooltip')}>
                      <IconButton size="small" color="success" onClick={() => openDialog(r, 'approve')}>
                        <CheckCircle fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('reviews.delete_tooltip')}>
                      <IconButton size="small" color="error" onClick={() => openDialog(r, 'delete')}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('reviews.keep_flagged_tooltip')}>
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
          {getDialogTitle(dialog.action)}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {dialog.review && (
              <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                  <Rating value={dialog.review.rating} readOnly size="small" />
                  <Typography variant="caption" color="text.secondary">
                    {t('reviews.dialog.by')} {dialog.review.customer?.firstName} {dialog.review.customer?.lastName}
                  </Typography>
                </Stack>
                <Typography variant="body2">{dialog.review.comment || <em>{t('reviews.no_comment')}</em>}</Typography>
              </Box>
            )}

            <TextField
              label={reasonRequired ? t('reviews.dialog.reason_required_label') : t('reviews.dialog.reason_optional_label')}
              multiline
              rows={2}
              required={reasonRequired}
              value={dialog.reason}
              onChange={e => setDialog(s => ({ ...s, reason: e.target.value }))}
              helperText={
                dialog.action === 'delete'       ? t('reviews.dialog.reason_audit_helper') :
                dialog.action === 'keep_flagged' ? t('reviews.dialog.reason_review_helper') :
                t('reviews.dialog.reason_optional_helper')
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(INITIAL_DIALOG)}>{t('reviews.dialog.cancel')}</Button>
          <Button
            variant="contained"
            color={getActionColor(dialog.action)}
            onClick={handleConfirm}
            disabled={(reasonRequired && !dialog.reason.trim()) || moderateMutation.isPending}
          >
            {moderateMutation.isPending ? t('reviews.dialog.processing') : getConfirmLabel(dialog.action)}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminReviewsPage;
