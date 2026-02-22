/**
 * AssistantProviderCard - Provider card for AI Assistant results
 *
 * Similar to the provider cards in FindProvidersPage but with:
 * - Match score badge (percentage from the ranking algorithm)
 * - Simplified layout (no distance/duration since no GPS search)
 */

import React from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  Chip,
  Rating,
  Divider,
  Button,
  Stack,
  Tooltip,
} from '@mui/material';
import { Security, Verified, CheckCircleOutline, WarningAmberOutlined } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { WorkflowProviderResult, ProviderAnalysis } from '../../services/api';

interface AssistantProviderCardProps {
  provider: WorkflowProviderResult;
  analysis?: ProviderAnalysis;
}

const AssistantProviderCard: React.FC<AssistantProviderCardProps> = ({ provider, analysis }) => {
  const { t } = useTranslation('assistant');

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1 }}>
        {/* Header with match score */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1 }}>
              {provider.businessName}
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Rating value={provider.rating} readOnly size="small" precision={0.5} />
              <Typography variant="body2" sx={{ ml: 1 }}>
                {t('results.rating', {
                  rating: provider.rating.toFixed(1),
                  count: provider.totalReviews,
                })}
              </Typography>
            </Box>
          </Box>

          {/* TODO: Match Score Badge
           *
           * Display the provider's matchScore as a percentage chip.
           *
           * Requirements:
           * - Use a MUI Chip component
           * - Label: use t('results.matchScore', { score: <rounded percentage> })
           *   The matchScore is 0-1 (e.g., 0.85), multiply by 100 and round
           * - Color: 'success' if score >= 0.7, 'warning' if >= 0.4, 'default' otherwise
           * - Size: 'small'
           *
           * Hint: Math.round(provider.matchScore * 100)
           */}
          <Chip
            label={t('results.matchScore', { score: Math.round(provider.matchScore * 100) })}
            size="small"
            color={provider.matchScore >= 0.7 ? 'success' : provider.matchScore >= 0.4 ? 'warning' : 'default'}
          />
        </Box>

        {/* Services */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {provider.services.slice(0, 3).map((service, index) => (
              <Chip
                key={index}
                label={service}
                size="small"
                variant="outlined"
              />
            ))}
            {provider.services.length > 3 && (
              <Chip
                label={`+${provider.services.length - 3} more`}
                size="small"
                variant="outlined"
              />
            )}
          </Box>
        </Box>

        {/* Verification badges */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          {provider.isInsured && (
            <Tooltip title={t('results.insured')}>
              <Chip
                icon={<Security />}
                label={t('results.insured')}
                size="small"
                color="success"
                variant="outlined"
              />
            </Tooltip>
          )}
          {provider.isBackgroundChecked && (
            <Tooltip title={t('results.backgroundChecked')}>
              <Chip
                icon={<Verified />}
                label={t('results.backgroundChecked')}
                size="small"
                color="info"
                variant="outlined"
              />
            </Tooltip>
          )}
        </Box>

        {/* Pricing */}
        {provider.pricing && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6" color="primary.main">
              ${provider.pricing.baseRate}
              <Typography component="span" variant="body2" color="text.secondary">
                /{provider.pricing.rateType}
              </Typography>
            </Typography>
          </Box>
        )}

        {/* Location */}
        {provider.location && (
          <Typography variant="body2" color="text.secondary">
            {provider.location.city}, {provider.location.state}
          </Typography>
        )}

        {/* AI Analysis */}
        {analysis && (
          <Box sx={{ mt: 2 }}>
            <Divider sx={{ mb: 1.5 }} />

            {/* Review sentiment */}
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mb: 1 }}>
              "{analysis.reviewSentiment}"
            </Typography>

            {/* Strengths */}
            <Stack spacing={0.5} sx={{ mb: 1 }}>
              {analysis.strengths.map((s, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                  <CheckCircleOutline sx={{ fontSize: 14, color: 'success.main', mt: '3px', flexShrink: 0 }} />
                  <Typography variant="caption">{s}</Typography>
                </Box>
              ))}
            </Stack>

            {/* Concerns */}
            {analysis.concerns.length > 0 && (
              <Stack spacing={0.5}>
                {analysis.concerns.map((c, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                    <WarningAmberOutlined sx={{ fontSize: 14, color: 'warning.main', mt: '3px', flexShrink: 0 }} />
                    <Typography variant="caption" color="text.secondary">{c}</Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        )}
      </CardContent>

      <Divider />

      {/* Action buttons */}
      <Box sx={{ p: 2 }}>
        <Stack direction="row" spacing={1}>
          <Button fullWidth variant="outlined">
            {t('actions.viewProfile')}
          </Button>
          <Button fullWidth variant="contained">
            {t('actions.requestQuote')}
          </Button>
        </Stack>
      </Box>
    </Card>
  );
};

export default AssistantProviderCard;
