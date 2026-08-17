import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Button,
  Collapse,
  Divider,
  Avatar,
  Rating,
  useTheme,
  alpha,
} from '@mui/material';
import {
  LocationOn,
  Schedule,
  AttachMoney,
  ExpandMore,
  CheckCircle,
  Cancel,
  Chat,
  Compare,
  Person,
  HourglassEmpty,
} from '@mui/icons-material';
import { QuoteRequest, Quote } from '../../services/api';
import { tokens } from '../../theme/theme';
import { formatMoney } from '../../utils/money';

interface RequestCardProps {
  request: QuoteRequest;
  quotes: Quote[];
  expanded: boolean;
  onToggle: () => void;
  onAcceptQuote: (quote: Quote) => void;
  onRejectQuote: (quote: Quote) => void;
  onMessageProvider: (quote: Quote) => void;
  onCloseRequest: (request: QuoteRequest) => void;
  onCompare: (quotes: Quote[]) => void;
  acceptPending: boolean;
  highlightQuoteId?: string | null;
}

const formatServiceName = (service: string) =>
  service.replace(/_/g, ' ').replace(/(^|\s)(\S)/g, (_, s, c) => s + c.toUpperCase());

const formatCurrency = (amount: number | string) => formatMoney(amount);

/**
 * A customer's quote request rendered as a lifecycle card in the unified Bookings
 * hub. Master-detail: the received quotes are nested and collapsed by default
 * (kept scannable in a long list); expand to compare/act on them inline.
 */
const RequestCard: React.FC<RequestCardProps> = ({
  request,
  quotes,
  expanded,
  onToggle,
  onAcceptQuote,
  onRejectQuote,
  onMessageProvider,
  onCloseRequest,
  onCompare,
  acceptPending,
  highlightQuoteId,
}) => {
  const { t } = useTranslation('bookings');
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const pendingQuotes = quotes.filter((q) => q.status === 'pending');
  const hasQuotes = quotes.length > 0;
  // Direct (single-provider) requests carry exactly one targetProviderId.
  const isDirect = Array.isArray(request.targetProviderIds) && request.targetProviderIds.length > 0;

  const borderColor = hasQuotes ? tokens.color.gold : tokens.color.stone;

  return (
    <Box
      sx={{
        borderRadius: tokens.radius.lg,
        border: `1px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
        bgcolor: isDark ? tokens.color.nightCard : tokens.color.paper,
        overflow: 'hidden',
        borderLeft: `4px solid ${borderColor}`,
      }}
    >
      {/* Header */}
      <Box sx={{
        px: 3, pt: 2.5, pb: 2,
        bgcolor: hasQuotes
          ? (isDark ? alpha(tokens.color.gold, 0.06) : `${tokens.color.gold}0D`)
          : 'transparent',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        flexWrap: 'wrap', gap: 1,
      }}>
        <Box>
          <Typography sx={{
            fontFamily: tokens.font.display, fontSize: '1.125rem', fontWeight: 500,
            color: 'text.primary', mb: 0.25,
          }}>
            {formatServiceName(request.serviceType)}
          </Typography>
          <Typography sx={{ fontFamily: tokens.font.mono, fontSize: '0.7rem', color: 'text.disabled' }}>
            {isDirect ? t('hub.direct_badge') : t('hub.open_badge')} · #{request.id.substring(0, 8).toUpperCase()}
          </Typography>
        </Box>
        <Box sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.6,
          px: 1.5, py: 0.5, borderRadius: tokens.radius.full,
          bgcolor: hasQuotes ? `${tokens.color.gold}22` : `${tokens.color.stone}18`,
          border: `1px solid ${(hasQuotes ? tokens.color.gold : tokens.color.stone)}44`,
        }}>
          <HourglassEmpty sx={{ fontSize: 13, color: hasQuotes ? tokens.color.gold : tokens.color.stone }} />
          <Typography sx={{
            fontFamily: tokens.font.body, fontSize: '0.75rem', fontWeight: 600,
            color: hasQuotes ? tokens.color.gold : tokens.color.stone, lineHeight: 1,
          }}>
            {hasQuotes ? t('hub.quotes_count', { count: quotes.length }) : t('hub.awaiting_quotes')}
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ opacity: 0.5 }} />

      {/* Request details */}
      <Box sx={{ px: 3, py: 2, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <LocationOn sx={{ fontSize: 15, color: 'text.disabled' }} />
          <Typography variant="body2" color="text.secondary">
            {request.location.city}{request.location.state ? `, ${request.location.state}` : ''}
          </Typography>
        </Box>
        {request.budget && Number.isFinite(Number(request.budget.min)) && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <AttachMoney sx={{ fontSize: 15, color: 'text.disabled' }} />
            <Typography variant="body2" color="text.secondary">
              {Number(request.budget.min) === Number(request.budget.max)
                ? formatCurrency(request.budget.min)
                : t('hub.budget_range', {
                    min: formatCurrency(request.budget.min),
                    max: formatCurrency(request.budget.max),
                  })}
            </Typography>
          </Box>
        )}
        {request.preferredDate && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Schedule sx={{ fontSize: 15, color: 'text.disabled' }} />
            <Typography variant="body2" color="text.secondary">
              {t('hub.preferred_date', { date: new Date(request.preferredDate).toLocaleDateString('pt-BR') })}
            </Typography>
          </Box>
        )}
      </Box>

      {request.description && (
        <Box sx={{ px: 3, pb: 1.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{
            borderLeft: `2px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
            pl: 1.5, fontStyle: 'italic',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {request.description}
          </Typography>
        </Box>
      )}

      {/* Quotes toggle + actions row */}
      <Box sx={{ px: 3, pb: 2, pt: 0.5, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        {hasQuotes ? (
          <Button
            size="small"
            onClick={onToggle}
            endIcon={<ExpandMore sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />}
            sx={{ color: tokens.color.earth, borderRadius: tokens.radius.full }}
          >
            {expanded ? t('hub.hide_quotes') : t('hub.view_quotes')}
          </Button>
        ) : (
          <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
            {t('hub.no_quotes_yet')}
          </Typography>
        )}

        {pendingQuotes.length > 1 && (
          <Button
            size="small"
            startIcon={<Compare fontSize="small" />}
            onClick={() => onCompare(pendingQuotes)}
            sx={{ color: 'text.secondary', borderRadius: tokens.radius.full }}
          >
            {t('hub.compare')}
          </Button>
        )}

        <Box sx={{ flex: 1 }} />

        <Button
          size="small"
          variant="text"
          startIcon={<Cancel fontSize="small" />}
          onClick={() => onCloseRequest(request)}
          sx={{ color: 'text.disabled', borderRadius: tokens.radius.full }}
        >
          {t('hub.close_request')}
        </Button>
      </Box>

      {/* Nested quotes */}
      {hasQuotes && (
        <Collapse in={expanded} unmountOnExit>
          <Divider sx={{ opacity: 0.5 }} />
          <Box sx={{ bgcolor: isDark ? alpha('#000', 0.15) : alpha('#000', 0.015) }}>
            {quotes.map((quote, i) => (
              <Box
                key={quote.id}
                data-quote-id={quote.id}
                sx={{
                  px: 3, py: 2,
                  borderBottom: i < quotes.length - 1
                    ? `1px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`
                    : 'none',
                  outline: highlightQuoteId === quote.id ? `2px solid ${tokens.color.gold}` : 'none',
                  outlineOffset: -2,
                  transition: 'outline-color 0.3s',
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                    <Avatar sx={{ width: 34, height: 34, bgcolor: alpha(tokens.color.earth, 0.15), color: tokens.color.earth }}>
                      <Person sx={{ fontSize: 18 }} />
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {quote.provider?.businessName || '—'}
                      </Typography>
                      {quote.provider && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Rating value={Number(quote.provider.rating) || 0} readOnly size="small" />
                          <Typography variant="caption" color="text.disabled">
                            ({quote.provider.totalReviews})
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography sx={{ fontFamily: tokens.font.mono, fontSize: '1.05rem', fontWeight: 700, color: tokens.color.terra }}>
                      {formatCurrency(quote.estimatedPrice)}
                    </Typography>
                    <Typography variant="caption" color="text.disabled">
                      {(quote.estimatedDuration / 60).toFixed(1)}h · {t('hub.valid_until', { date: new Date(quote.validUntil).toLocaleDateString('pt-BR') })}
                    </Typography>
                  </Box>
                </Box>

                {quote.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {quote.description}
                  </Typography>
                )}

                {quote.status === 'pending' ? (
                  <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                    <Button
                      size="small" variant="contained"
                      startIcon={<CheckCircle fontSize="small" />}
                      onClick={() => onAcceptQuote(quote)}
                      disabled={acceptPending}
                      sx={{ bgcolor: tokens.color.earth, '&:hover': { bgcolor: tokens.color.earthLight }, borderRadius: tokens.radius.full, px: 2.5 }}
                    >
                      {t('hub.accept')}
                    </Button>
                    <Button
                      size="small" variant="outlined"
                      startIcon={<Cancel fontSize="small" />}
                      onClick={() => onRejectQuote(quote)}
                      disabled={acceptPending}
                      sx={{ borderColor: tokens.color.terra, color: tokens.color.terra, borderRadius: tokens.radius.full, px: 2.5 }}
                    >
                      {t('hub.reject')}
                    </Button>
                    <Button
                      size="small" variant="text"
                      startIcon={<Chat fontSize="small" />}
                      onClick={() => onMessageProvider(quote)}
                      sx={{ color: 'text.secondary', borderRadius: tokens.radius.full }}
                    >
                      {t('hub.message')}
                    </Button>
                  </Box>
                ) : (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: quote.status === 'accepted' ? tokens.color.earth : 'text.disabled' }}>
                      {t(`hub.qstatus.${quote.status}`, quote.status)}
                    </Typography>
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </Collapse>
      )}
    </Box>
  );
};

export default RequestCard;
