import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableHead, TableRow,
  Chip, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, RadioGroup, FormControlLabel, Radio, FormLabel,
  CircularProgress, Alert, Tooltip,
} from '@mui/material';
import { Gavel, Person, Business, AttachMoney } from '@mui/icons-material';
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
        <Typography variant="h4">Dispute Resolution</Typography>
        <Chip label={`${data?.pagination?.total ?? 0} total`} sx={{ ml: 1 }} />
      </Box>

      {/* Filter tabs */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        {(['open', 'resolved', 'all'] as const).map(f => (
          <Button key={f} variant={filter === f ? 'contained' : 'outlined'} size="small"
            onClick={() => setFilter(f)} sx={{ textTransform: 'capitalize' }}>
            {f}
          </Button>
        ))}
      </Box>

      {isLoading ? (
        <CircularProgress />
      ) : disputes.length === 0 ? (
        <Alert severity="success">No {filter !== 'all' ? filter : ''} disputes.</Alert>
      ) : (
        <Paper>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Booking</TableCell>
                <TableCell>Service</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Provider</TableCell>
                <TableCell>Dispute Reason</TableCell>
                <TableCell>Raised</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {disputes.map((d: DisputeBooking) => (
                <TableRow key={d.id} hover>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{d.id.slice(0, 8)}…</TableCell>
                  <TableCell>{d.serviceType}</TableCell>
                  <TableCell>${Number(d.totalAmount).toFixed(2)}</TableCell>
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
                        ? (d.disputeResolution === 'provider_favor' ? 'Provider won' : 'Customer won')
                        : 'Open'}
                      color={d.disputeStatus === 'resolved' ? 'default' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {d.disputeStatus === 'open' ? (
                      <Button size="small" variant="contained" color="warning"
                        startIcon={<Gavel />} onClick={() => openResolve(d)}>
                        Resolve
                      </Button>
                    ) : (
                      <Tooltip title={d.adminNotes || 'No notes'}>
                        <Typography variant="caption" color="text.secondary">Resolved</Typography>
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
          <Gavel /> Resolve Dispute
        </DialogTitle>
        <DialogContent>
          {selected && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <Alert severity="warning" icon={<AttachMoney />}>
                Hold amount: <strong>${Number(selected.totalAmount).toFixed(2)}</strong> for {selected.serviceType}
              </Alert>

              <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">Dispute reason</Typography>
                <Typography>{selected.disputeReason || 'No reason provided'}</Typography>
              </Box>

              <FormLabel>Decision</FormLabel>
              <RadioGroup value={decision} onChange={e => setDecision(e.target.value as any)}>
                <FormControlLabel value="capture" control={<Radio />}
                  label={<Box><strong>Release to provider</strong> — capture the held funds, booking marked COMPLETED</Box>} />
                <FormControlLabel value="refund" control={<Radio />}
                  label={<Box><strong>Refund to customer</strong> — cancel the hold, card never charged, booking CANCELLED</Box>} />
              </RadioGroup>

              <TextField label="Admin notes (optional)" multiline rows={3} fullWidth
                value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                placeholder="Reason for decision, evidence reviewed..." />

              {error && <Alert severity="error">{error}</Alert>}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)} disabled={resolving}>Cancel</Button>
          <Button variant="contained" color={decision === 'capture' ? 'success' : 'error'}
            onClick={handleResolve} disabled={resolving}
            startIcon={resolving ? <CircularProgress size={16} /> : <Gavel />}>
            {resolving ? 'Processing…' : decision === 'capture' ? 'Release Payment' : 'Refund Customer'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminDisputesPage;
