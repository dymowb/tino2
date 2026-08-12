import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Button,
  Stack,
  Divider,
  Alert,
  useTheme,
  alpha,
} from '@mui/material';
import {
  LocationOn,
  AttachMoney,
  Schedule,
  Send,
  Refresh,
  WorkOutline,
  PriorityHigh,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { apiService, QuoteRequest } from '../../services/api';
import { tokens } from '../../theme/theme';
import PageSkeleton from '../common/PageSkeleton';
import QuoteSubmissionDialog from '../quotes/QuoteSubmissionDialog';
import { formatMoney } from '../../utils/money';

const formatServiceName = (s: string) =>
  s.replace(/_/g, ' ').replace(/(^|\s)(\S)/g, (_, sp, c) => sp + c.toUpperCase());

const formatCurrency = (amount: number | string) => formatMoney(amount);

const URGENCY_COLOR: Record<string, string> = {
  urgent: tokens.color.terra, high: tokens.color.gold, medium: tokens.color.earth, low: tokens.color.stone,
};

/**
 * Provider "find work" feed — open requests in their area they can quote on,
 * kept separate from their own jobs (the Bookings hub). Direct requests surface
 * the customer's proposed terms so the provider can confirm or counter.
 */
const OpportunitiesPage: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const { t } = useTranslation(['bookings', 'quotes']);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isProvider = user?.userType === 'provider';

  const [selectedRequest, setSelectedRequest] = useState<QuoteRequest | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['available-quote-requests'],
    queryFn: () => apiService.searchQuoteRequests({ status: 'open' }),
    enabled: isAuthenticated && isProvider,
    staleTime: 30 * 1000,
  });

  const requests: QuoteRequest[] = Array.isArray(data?.data) ? data!.data : [];

  if (!isAuthenticated || !isProvider) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6">{t('bookings:list.login_required')}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 2, md: 4 }, py: 4, maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', mb: 4, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography sx={{ fontFamily: tokens.font.display, fontSize: { xs: '1.75rem', md: '2.25rem' }, fontWeight: 500, lineHeight: 1.1, color: 'text.primary' }}>
            {t('bookings:opportunities.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t('bookings:opportunities.subtitle')}
          </Typography>
        </Box>
        <Button startIcon={<Refresh fontSize="small" />} onClick={() => refetch()} variant="outlined" size="small"
          disabled={isLoading} sx={{ borderRadius: tokens.radius.full, px: 2 }}>
          {t('bookings:list.refresh')}
        </Button>
      </Box>

      {isLoading && <PageSkeleton variant="list" />}
      {error && <Alert severity="error" sx={{ mb: 3 }}>{t('bookings:list.error_loading')}</Alert>}

      {!isLoading && !error && requests.length === 0 && (
        <Box sx={{ py: 8, textAlign: 'center', border: `1px dashed ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`, borderRadius: tokens.radius.lg }}>
          <WorkOutline sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
          <Typography variant="body1" color="text.secondary">{t('bookings:opportunities.empty')}</Typography>
        </Box>
      )}

      {!isLoading && !error && requests.length > 0 && (
        <AnimatePresence>
          <Stack spacing={2}>
            {requests.map((req, i) => {
              const isDirect = Array.isArray(req.targetProviderIds) && req.targetProviderIds.length > 0;
              const urgencyColor = URGENCY_COLOR[req.urgency] || tokens.color.stone;
              const proposedDuration = req.requirements?.find(r => r.category === 'proposed_duration_hours')?.requirement;
              return (
                <motion.div key={req.id}
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}>
                  <Box sx={{
                    borderRadius: tokens.radius.lg,
                    border: `1px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
                    bgcolor: isDark ? tokens.color.nightCard : tokens.color.paper,
                    overflow: 'hidden',
                    borderLeft: `4px solid ${isDirect ? tokens.color.gold : tokens.color.earth}`,
                  }}>
                    <Box sx={{ px: 3, pt: 2.5, pb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
                      <Box>
                        <Typography sx={{ fontFamily: tokens.font.display, fontSize: '1.125rem', fontWeight: 500, mb: 0.25 }}>
                          {formatServiceName(req.serviceType)}
                        </Typography>
                        <Typography sx={{ fontFamily: tokens.font.mono, fontSize: '0.7rem', color: 'text.disabled' }}>
                          {isDirect ? t('bookings:hub.direct_badge') : t('bookings:hub.open_badge')} · #{req.id.substring(0, 8).toUpperCase()}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.5, borderRadius: tokens.radius.full, bgcolor: `${urgencyColor}1F`, border: `1px solid ${urgencyColor}44` }}>
                        <PriorityHigh sx={{ fontSize: 13, color: urgencyColor }} />
                        <Typography sx={{ fontFamily: tokens.font.body, fontSize: '0.72rem', fontWeight: 600, color: urgencyColor, lineHeight: 1 }}>
                          {t(`quotes:urgency.${req.urgency}`, req.urgency)}
                        </Typography>
                      </Box>
                    </Box>

                    <Divider sx={{ opacity: 0.5 }} />

                    <Box sx={{ px: 3, py: 2, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <LocationOn sx={{ fontSize: 15, color: 'text.disabled' }} />
                        <Typography variant="body2" color="text.secondary">
                          {req.location.city}{req.location.state ? `, ${req.location.state}` : ''}
                        </Typography>
                      </Box>
                      {req.budget && Number.isFinite(Number(req.budget.min)) && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <AttachMoney sx={{ fontSize: 15, color: 'text.disabled' }} />
                          <Typography variant="body2" color="text.secondary">
                            {Number(req.budget.min) === Number(req.budget.max)
                              ? formatCurrency(req.budget.min)
                              : t('bookings:hub.budget_range', { min: formatCurrency(req.budget.min), max: formatCurrency(req.budget.max) })}
                          </Typography>
                        </Box>
                      )}
                      {req.preferredDate && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <Schedule sx={{ fontSize: 15, color: 'text.disabled' }} />
                          <Typography variant="body2" color="text.secondary">
                            {t('bookings:hub.preferred_date', { date: new Date(req.preferredDate).toLocaleDateString('pt-BR') })}
                          </Typography>
                        </Box>
                      )}
                    </Box>

                    {req.description && (
                      <Box sx={{ px: 3, pb: 1.5 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ borderLeft: `2px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`, pl: 1.5, fontStyle: 'italic' }}>
                          {req.description}
                        </Typography>
                      </Box>
                    )}

                    {/* Direct request → surface the customer's proposed terms (confirm or counter) */}
                    {isDirect && (req.budget || proposedDuration) && (
                      <Box sx={{ mx: 3, mb: 1.5, p: 1.5, borderRadius: tokens.radius.sm, bgcolor: isDark ? alpha(tokens.color.gold, 0.08) : `${tokens.color.gold}12`, border: `1px solid ${tokens.color.gold}33` }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: tokens.color.gold }}>
                          {t('bookings:opportunities.proposed_terms')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {req.budget ? formatCurrency(req.budget.min) : ''}
                          {req.budget && proposedDuration ? ' · ' : ''}
                          {proposedDuration ? `${proposedDuration}h` : ''}
                          {' — '}{t('bookings:opportunities.confirm_or_counter')}
                        </Typography>
                      </Box>
                    )}

                    <Box sx={{ px: 3, pb: 2.5, pt: 1, display: 'flex', justifyContent: 'flex-end' }}>
                      <Button variant="contained" size="small" startIcon={<Send fontSize="small" />}
                        onClick={() => setSelectedRequest(req)}
                        sx={{ bgcolor: tokens.color.earth, '&:hover': { bgcolor: tokens.color.earthLight }, borderRadius: tokens.radius.full, px: 2.5 }}>
                        {isDirect ? t('bookings:opportunities.respond') : t('bookings:opportunities.submit_quote')}
                      </Button>
                    </Box>
                  </Box>
                </motion.div>
              );
            })}
          </Stack>
        </AnimatePresence>
      )}

      <QuoteSubmissionDialog
        open={!!selectedRequest}
        onClose={() => setSelectedRequest(null)}
        quoteRequest={selectedRequest}
      />
    </Box>
  );
};

export default OpportunitiesPage;
