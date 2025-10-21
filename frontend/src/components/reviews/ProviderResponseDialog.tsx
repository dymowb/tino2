import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Rating,
  Avatar,
  Chip,
  CircularProgress,
  Alert,
  Divider
} from '@mui/material';
import {
  Reply,
  Star,
  Person,
  Close,
  Send
} from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { apiService } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

interface ProviderResponseDialogProps {
  open: boolean;
  onClose: () => void;
  review: any;
}

const ProviderResponseDialog: React.FC<ProviderResponseDialogProps> = ({
  open,
  onClose,
  review
}) => {
  const { t } = useTranslation('reviews');
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [response, setResponse] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Add provider response mutation
  const addResponseMutation = useMutation({
    mutationFn: ({ reviewId, response }: { reviewId: string; response: string }) =>
      apiService.addProviderResponse(reviewId, response),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['provider-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['my-provider-reviews'] });
      toast.success(t('provider_response.success'));
      onClose();
      setResponse('');
      setErrors({});
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || t('provider_response.error'));
    },
  });

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!response.trim()) {
      newErrors.response = t('provider_response.validation.required');
    }
    if (response.length < 10) {
      newErrors.response = t('provider_response.validation.min_length');
    }
    if (response.length > 1000) {
      newErrors.response = t('provider_response.validation.max_length');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm() || !review) return;

    addResponseMutation.mutate({
      reviewId: review.id,
      response: response.trim()
    });
  };

  const handleClose = () => {
    setResponse('');
    setErrors({});
    onClose();
  };

  if (!review) return null;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { minHeight: '60vh' } }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Reply color="primary" />
          {t('provider_response.title')}
          <Box sx={{ ml: 'auto' }}>
            <Button onClick={handleClose} size="small">
              <Close />
            </Button>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        {/* Review Display */}
        <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
            <Avatar sx={{ bgcolor: 'secondary.main' }}>
              <Person />
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  {review.isAnonymous ? t('provider_response.anonymous_customer') : review.customer?.firstName || t('provider_response.customer_label')}
                </Typography>
                <Chip
                  label={t('provider_response.stars_label', { rating: review.rating })}
                  size="small"
                  color="primary"
                  icon={<Star />}
                />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {new Date(review.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </Typography>
              <Rating value={review.rating} readOnly size="small" sx={{ mb: 1 }} />
            </Box>
          </Box>

          <Typography variant="h6" sx={{ mb: 1 }}>
            {review.title}
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {review.comment}
          </Typography>

          {/* Criteria Breakdown */}
          {review.criteria && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('provider_response.detailed_ratings')}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {Object.entries(review.criteria).map(([key, value]) => (
                  <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2">
                      {`${t(`criteria_labels.${key}`)}: ${Number(value)}/5`}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </>
          )}
        </Box>

        {/* Check if response already exists */}
        {review.providerResponse && (
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              <strong>{t('provider_response.already_responded')}</strong>
            </Typography>
            <Box sx={{ mt: 1, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {t('provider_response.your_response_label', { date: new Date(review.providerResponse.createdAt).toLocaleDateString() })}
              </Typography>
              <Typography variant="body1">
                {review.providerResponse.response}
              </Typography>
            </Box>
          </Alert>
        )}

        {/* Response Form */}
        {!review.providerResponse && (
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              {t('provider_response.your_response_title')}
            </Typography>

            <TextField
              fullWidth
              multiline
              rows={4}
              label={t('provider_response.response_label')}
              placeholder={t('provider_response.response_placeholder')}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              error={!!errors.response}
              helperText={errors.response || t('provider_response.char_count', { count: response.length })}
              inputProps={{ maxLength: 1000 }}
              sx={{ mb: 2 }}
            />

            <Alert severity="info">
              <Typography variant="body2">
                <strong>{t('provider_response.guidelines_title')}</strong>
              </Typography>
              <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                <li>{t('provider_response.guideline_thank')}</li>
                <li>{t('provider_response.guideline_address')}</li>
                <li>{t('provider_response.guideline_concise')}</li>
                <li>{t('provider_response.guideline_avoid')}</li>
                <li>{t('provider_response.guideline_improve')}</li>
              </ul>
            </Alert>
          </Box>
        )}

        {/* Service Details */}
        {review.booking && (
          <Box sx={{ mt: 3, p: 2, bgcolor: 'primary.50', borderRadius: 1 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {t('provider_response.service_details')}
            </Typography>
            <Typography variant="body2">
              <strong>{t('provider_response.service_label')}</strong> {review.booking.serviceType?.replace('_', ' ')} |
              <strong> {t('provider_response.date_label')}</strong> {new Date(review.booking.scheduledDate).toLocaleDateString()} |
              <strong> {t('provider_response.amount_label')}</strong> ${review.booking.totalAmount}
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 3 }}>
        <Button
          onClick={handleClose}
          disabled={addResponseMutation.isPending}
        >
          {t('provider_response.cancel')}
        </Button>
        {!review.providerResponse && (
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={addResponseMutation.isPending}
            startIcon={addResponseMutation.isPending ? <CircularProgress size={20} /> : <Send />}
          >
            {addResponseMutation.isPending ? t('provider_response.submitting') : t('provider_response.submit')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ProviderResponseDialog;