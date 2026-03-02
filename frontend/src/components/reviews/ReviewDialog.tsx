import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Rating,
  Box,
  Typography,
  Grid,
  FormControlLabel,
  Checkbox,
  Alert,
  CircularProgress,
  Divider,
  Chip,
  Avatar
} from '@mui/material';
import {
  Star,
  Person,
  Schedule,
  AttachMoney,
  Close,
  PhotoCamera
} from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { apiService, Booking } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

interface ReviewDialogProps {
  open: boolean;
  onClose: () => void;
  booking: Booking | null;
  existingReview?: any;
  mode: 'create' | 'edit';
}

interface ReviewFormData {
  rating: number;
  title: string;
  comment: string;
  criteria: {
    quality: number;
    timeliness: number;
    communication: number;
    professionalism: number;
    valueForMoney: number;
  };
  isAnonymous: boolean;
  photos: string[];
}

const ReviewDialog: React.FC<ReviewDialogProps> = ({
  open,
  onClose,
  booking,
  existingReview,
  mode
}) => {
  const { t } = useTranslation('reviews');
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<ReviewFormData>({
    rating: 5,
    title: '',
    comment: '',
    criteria: {
      quality: 5,
      timeliness: 5,
      communication: 5,
      professionalism: 5,
      valueForMoney: 5
    },
    isAnonymous: false,
    photos: []
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form data when editing
  useEffect(() => {
    if (mode === 'edit' && existingReview) {
      setFormData({
        rating: existingReview.rating || 5,
        title: existingReview.title || '',
        comment: existingReview.comment || '',
        criteria: existingReview.criteria || {
          quality: 5,
          timeliness: 5,
          communication: 5,
          professionalism: 5,
          valueForMoney: 5
        },
        isAnonymous: existingReview.isAnonymous || false,
        photos: existingReview.photos || []
      });
    } else {
      setFormData({
        rating: 5,
        title: '',
        comment: '',
        criteria: {
          quality: 5,
          timeliness: 5,
          communication: 5,
          professionalism: 5,
          valueForMoney: 5
        },
        isAnonymous: false,
        photos: []
      });
    }
  }, [mode, existingReview, open]);

  // Create review mutation
  const createReviewMutation = useMutation({
    mutationFn: (reviewData: any) => apiService.createReview(reviewData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['provider-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['my-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['my-customer-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['all-customer-review-ids'] });
      queryClient.invalidateQueries({ queryKey: ['eligible-bookings'] });
      toast.success(t('create.success'));
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || t('create.error'));
    },
  });

  // Update review mutation
  const updateReviewMutation = useMutation({
    mutationFn: ({ reviewId, reviewData }: { reviewId: string; reviewData: any }) =>
      apiService.updateReview(reviewId, reviewData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['provider-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['my-reviews'] });
      toast.success(t('messages.update_success'));
      onClose();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || t('messages.update_error'));
    },
  });

  const resetForm = () => {
    setFormData({
      rating: 5,
      title: '',
      comment: '',
      criteria: {
        quality: 5,
        timeliness: 5,
        communication: 5,
        professionalism: 5,
        valueForMoney: 5
      },
      isAnonymous: false,
      photos: []
    });
    setErrors({});
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (formData.rating < 1 || formData.rating > 5) {
      newErrors.rating = 'Please select a rating between 1 and 5 stars';
    }
    if (!formData.title.trim()) {
      newErrors.title = 'Review title is required';
    }
    if (!formData.comment.trim()) {
      newErrors.comment = 'Review comment is required';
    }
    if (formData.comment.length < 10) {
      newErrors.comment = 'Review comment must be at least 10 characters';
    }

    // Validate criteria ratings
    Object.entries(formData.criteria).forEach(([key, value]) => {
      if (value < 1 || value > 5) {
        newErrors[key] = 'Rating must be between 1 and 5 stars';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const calculateOverallRating = (): number => {
    const criteriaValues = Object.values(formData.criteria);
    const average = criteriaValues.reduce((sum, value) => sum + value, 0) / criteriaValues.length;
    return Math.round(average * 10) / 10; // Round to 1 decimal place
  };

  const handleSubmit = () => {
    if (!validateForm() || !booking) return;

    const reviewData = {
      bookingId: booking.id,
      providerId: booking.providerId,
      rating: calculateOverallRating(),
      title: formData.title,
      comment: formData.comment,
      criteria: formData.criteria,
      isAnonymous: formData.isAnonymous,
      photos: formData.photos
    };

    if (mode === 'create') {
      createReviewMutation.mutate(reviewData);
    } else if (existingReview) {
      updateReviewMutation.mutate({
        reviewId: existingReview.id,
        reviewData: {
          rating: calculateOverallRating(),
          title: formData.title,
          comment: formData.comment,
          criteria: formData.criteria,
          isAnonymous: formData.isAnonymous,
          photos: formData.photos
        }
      });
    }
  };

  const handleCriteriaChange = (criterion: keyof typeof formData.criteria, value: number) => {
    setFormData({
      ...formData,
      criteria: {
        ...formData.criteria,
        [criterion]: value
      }
    });

    // Update overall rating based on criteria average
    const newOverallRating = calculateOverallRating();
    setFormData(prev => ({ ...prev, rating: newOverallRating }));
  };

  if (!booking) return null;

  const isLoading = createReviewMutation.isPending || updateReviewMutation.isPending;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { minHeight: '70vh' } }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Star color="primary" />
          {mode === 'create' ? t('create.title') : t('create.edit_title')}
          <Box sx={{ ml: 'auto' }}>
            <Button onClick={onClose} size="small">
              <Close />
            </Button>
          </Box>
        </Box>
      </DialogTitle>
      
      <DialogContent sx={{ pt: 2 }}>
        <Grid container spacing={3}>
          {/* Booking Info */}
          <Grid xs={12}>
            <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1, mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar sx={{ bgcolor: 'primary.main' }}>
                  <Person />
                </Avatar>
                <Box>
                  <Typography variant="h6">{booking.provider?.businessName || t('create.provider')}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('create.service_type')}: {booking.serviceType?.replace('_', ' ')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('create.date')}: {new Date(booking.scheduledDate).toLocaleDateString()}
                  </Typography>
                </Box>
                <Box sx={{ ml: 'auto' }}>
                  <Chip 
                    label={`$${booking.totalAmount}`} 
                    color="primary" 
                    icon={<AttachMoney />} 
                  />
                </Box>
              </Box>
            </Box>
          </Grid>

          {/* Overall Rating */}
          <Grid xs={12}>
            <Box sx={{ textAlign: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                {t('create.overall_rating_display', { rating: calculateOverallRating().toFixed(1) })}
              </Typography>
              <Rating
                value={calculateOverallRating()}
                precision={0.1}
                readOnly
                size="large"
              />
            </Box>
          </Grid>

          <Grid xs={12}>
            <Divider />
          </Grid>

          {/* Detailed Criteria Ratings */}
          <Grid xs={12}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              {t('create.rate_experience')}
            </Typography>
            {(Object.keys(formData.criteria) as Array<keyof typeof formData.criteria>).map((key) => (
              <Box key={key} sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body1">{t(`create.${key}`)}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formData.criteria[key]} stars
                  </Typography>
                </Box>
                <Rating
                  value={formData.criteria[key]}
                  onChange={(_, value) => handleCriteriaChange(key, value || 1)}
                  size="medium"
                />
                {errors[key] && (
                  <Typography variant="caption" color="error">
                    {errors[key]}
                  </Typography>
                )}
              </Box>
            ))}
          </Grid>

          {/* Review Title */}
          <Grid xs={12}>
            <TextField
              fullWidth
              label={t('create.review_title')}
              placeholder={t('create.title_placeholder')}
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              error={!!errors.title}
              helperText={errors.title}
              inputProps={{ maxLength: 100 }}
            />
          </Grid>

          {/* Review Comment */}
          <Grid xs={12}>
            <TextField
              fullWidth
              multiline
              rows={4}
              label={t('create.detailed_review')}
              placeholder={t('create.review_placeholder_detail')}
              value={formData.comment}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              error={!!errors.comment}
              helperText={errors.comment || t('create.char_count_500', { count: formData.comment.length })}
              inputProps={{ maxLength: 500 }}
            />
          </Grid>

          {/* Photo Upload Placeholder */}
          <Grid xs={12}>
            <Box sx={{ border: '2px dashed', borderColor: 'grey.300', borderRadius: 1, p: 3, textAlign: 'center' }}>
              <PhotoCamera sx={{ fontSize: 48, color: 'grey.400', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                {t('create.photo_coming_soon')}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t('create.photo_help_text')}
              </Typography>
            </Box>
          </Grid>

          {/* Anonymous Option */}
          <Grid xs={12}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.isAnonymous}
                  onChange={(e) => setFormData({ ...formData, isAnonymous: e.target.checked })}
                />
              }
              label={t('create.post_anonymously')}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {t('create.anonymous_help_text')}
            </Typography>
          </Grid>

          {/* Review Guidelines */}
          <Grid xs={12}>
            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>{t('create.guidelines')}:</strong> {t('create.guidelines_text')}
              </Typography>
            </Alert>
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ p: 3 }}>
        <Button
          onClick={onClose}
          disabled={isLoading}
        >
          {t('create.cancel')}
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isLoading}
          startIcon={isLoading ? <CircularProgress size={20} /> : <Star />}
        >
          {isLoading
            ? (mode === 'create' ? t('create.submitting') : t('create.updating'))
            : (mode === 'create' ? t('create.submit') : t('create.update'))
          }
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ReviewDialog;