import React, { useState } from 'react';
import {
  Box, Typography, TextField, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, CircularProgress, Alert, Stack, InputAdornment,
} from '@mui/material';
import { Search, CampaignOutlined, PersonPinCircleOutlined } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiService } from '../../services/api';
import { formatMoney } from '../../utils/money';

interface AdminQuoteRequest {
  id: string;
  serviceType: string;
  status: string;
  city: string | null;
  createdAt: string;
  quotesReceived: number;
  customer: { name: string; email: string } | null;
  targeting: 'broadcast' | 'direct';
  category: string | null;
  targetProviders: { id: string; name: string }[];
  matchedProviders: { id: string; name: string }[] | null;
  matchedCount: number | null;
  quotes: { id: string; provider: string | null; price: number; status: string }[];
}

const fmtBRL = (n: number) => formatMoney(n);
const QUOTE_STATUS_COLOR: Record<string, 'default' | 'success' | 'error' | 'warning'> = {
  pending: 'warning', accepted: 'success', rejected: 'error', withdrawn: 'default', expired: 'default',
};

const AdminQuoteRequestsPage: React.FC = () => {
  const { t } = useTranslation('admin');
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-quote-requests', search],
    queryFn: async () => {
      const res = await apiService.get('/admin/quote-requests', { params: search ? { search } : {} });
      return (res.data.data as AdminQuoteRequest[]) || [];
    },
  });

  return (
    <Box>
      <Typography variant="h4" gutterBottom>{t('quote_requests.title', 'Quote Requests')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('quote_requests.subtitle', 'Inspect who each request reached (broadcast vs. targeted) and who responded.')}
      </Typography>

      <TextField
        fullWidth size="small" sx={{ mb: 3, maxWidth: 420 }}
        placeholder={t('quote_requests.search_placeholder', 'Search by request ID (e.g. 6068582C)')}
        value={search}
        onChange={(e) => setSearch(e.target.value.trim())}
        InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
      />

      {isLoading && <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box>}
      {error && <Alert severity="error">{t('quote_requests.error', 'Failed to load quote requests')}</Alert>}

      {!isLoading && !error && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('quote_requests.col_request', 'Request')}</TableCell>
                <TableCell>{t('quote_requests.col_customer', 'Customer')}</TableCell>
                <TableCell>{t('quote_requests.col_sent_to', 'Sent to')}</TableCell>
                <TableCell>{t('quote_requests.col_quotes', 'Quotes received')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(data || []).length === 0 && (
                <TableRow><TableCell colSpan={4}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    {t('quote_requests.empty', 'No quote requests found.')}
                  </Typography>
                </TableCell></TableRow>
              )}
              {(data || []).map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {r.serviceType} <Chip label={r.status} size="small" sx={{ ml: 0.5, height: 18 }} />
                    </Typography>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }} color="text.secondary">
                      #{r.id.substring(0, 8).toUpperCase()}{r.city ? ` · ${r.city}` : ''}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {r.customer ? (
                      <>
                        <Typography variant="body2">{r.customer.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{r.customer.email}</Typography>
                      </>
                    ) : <Typography variant="caption" color="text.secondary">—</Typography>}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 300 }}>
                    {r.targeting === 'broadcast' ? (
                      <Stack spacing={0.5}>
                        <Chip icon={<CampaignOutlined />} size="small" color="info" variant="outlined"
                          sx={{ alignSelf: 'flex-start' }}
                          label={t('quote_requests.broadcast_count', { count: r.matchedCount ?? 0, defaultValue: 'Broadcast → {{count}} matched' })} />
                        {(r.matchedProviders || []).length === 0 ? (
                          <Typography variant="caption" color="error">
                            {t('quote_requests.no_match', 'No providers match (category/radius) — reaches no one')}
                          </Typography>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            {(r.matchedProviders || []).map(p => p.name).join(', ')}
                          </Typography>
                        )}
                      </Stack>
                    ) : (
                      <Stack spacing={0.5}>
                        <Chip icon={<PersonPinCircleOutlined />} size="small" color="warning" variant="outlined"
                          label={t('quote_requests.direct', 'Direct')} sx={{ alignSelf: 'flex-start' }} />
                        {r.targetProviders.map(p => (
                          <Typography key={p.id} variant="caption">{p.name}</Typography>
                        ))}
                      </Stack>
                    )}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 280 }}>
                    {r.quotes.length === 0 ? (
                      <Typography variant="caption" color="text.secondary">
                        {t('quote_requests.no_quotes', 'No quotes yet')}
                      </Typography>
                    ) : (
                      <Stack spacing={0.5}>
                        {r.quotes.map(q => (
                          <Box key={q.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="caption" sx={{ flex: 1 }}>{q.provider || '—'}</Typography>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{fmtBRL(q.price)}</Typography>
                            <Chip label={q.status} size="small" color={QUOTE_STATUS_COLOR[q.status] || 'default'}
                              sx={{ height: 16, fontSize: '0.65rem' }} />
                          </Box>
                        ))}
                      </Stack>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default AdminQuoteRequestsPage;
