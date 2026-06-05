/**
 * AssistantProviderCard - Provider card for AI Assistant results
 *
 * Similar to the provider cards in FindProvidersPage but with:
 * - Match score badge (percentage from the ranking algorithm)
 * - Simplified layout (no distance/duration since no GPS search)
 */

import React, { useState } from 'react';
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
import { Security, Verified, CheckCircleOutline, WarningAmberOutlined, CheckBox, CheckBoxOutlineBlank } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { WorkflowProviderResult, ProviderAnalysis } from '../../services/api';

interface AssistantProviderCardProps {
  provider: WorkflowProviderResult;
  analysis?: ProviderAnalysis;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  selectionDisabled?: boolean;
  onViewProfile?: () => void;
}

const AssistantProviderCard: React.FC<AssistantProviderCardProps> = ({
  provider, analysis, isSelected = false, onToggleSelect, selectionDisabled = false, onViewProfile,
}) => {
  const { t } = useTranslation(['assistant', 'providers']);
  const ratingNum = Number(provider.rating);
  const hasRating = Number.isFinite(ratingNum) && ratingNum > 0 && (provider.totalReviews ?? 0) > 0;

  return (
    <Card sx={{
      height: '100%', display: 'flex', flexDirection: 'column',
      outline: isSelected ? '2px solid' : '1px solid transparent',
      outlineColor: isSelected ? 'primary.main' : 'transparent',
      transition: 'outline 0.15s ease',
    }}>
      <CardContent sx={{ flexGrow: 1 }}>
        {/* Header with match score */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1 }}>
              {provider.businessName}
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Rating value={hasRating ? ratingNum : 0} readOnly size="small" precision={0.5} />
              <Typography variant="body2" sx={{ ml: 1 }}>
                {hasRating
                  ? t('results.rating', { rating: ratingNum.toFixed(1), count: provider.totalReviews })
                  : t('providers:card.no_rating', 'Novo')}
              </Typography>
            </Box>
          </Box>

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
                label={t('providers:card.more_services', { count: provider.services.length - 3 })}
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
              R${provider.pricing.baseRate}
              <Typography component="span" variant="body2" color="text.secondary">
                {t(`providers:card.${provider.pricing.rateType || 'hourly'}`, '/hora')}
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

      {/* Action footer — fixed height so all cards align */}
      <Box sx={{ p: 1.5, mt: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button variant="outlined" size="small" onClick={onViewProfile} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
          {t('actions.viewProfile')}
        </Button>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={selectionDisabled && !isSelected ? t('actions.maxSelected') : ''}>
          <span>
            <Chip
              icon={isSelected ? <CheckBox fontSize="small" /> : <CheckBoxOutlineBlank fontSize="small" />}
              label={t('actions.requestQuote')}
              onClick={selectionDisabled && !isSelected ? undefined : onToggleSelect}
              color={isSelected ? 'success' : 'default'}
              variant={isSelected ? 'filled' : 'outlined'}
              size="small"
              clickable={!(selectionDisabled && !isSelected)}
              sx={{ fontWeight: isSelected ? 600 : 400, cursor: selectionDisabled && !isSelected ? 'not-allowed' : 'pointer' }}
            />
          </span>
        </Tooltip>
      </Box>
    </Card>
  );
};

export default AssistantProviderCard;
