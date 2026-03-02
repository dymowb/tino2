import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Chip,
  Divider,
  CircularProgress
} from '@mui/material';
import Grid from '@mui/material/Unstable_Grid2';
import {
  LocationOn,
  Schedule,
  Payment,
  Description,
  Person,
  Star
} from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { apiService, Provider, Booking } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

interface BookingDialogProps {
  open: boolean;
  onClose: () => void;
  provider: Provider | null;
  serviceType?: string;
}

interface BookingFormData {
  serviceType: string;
  scheduledDate: Date | null;
  estimatedDuration: number;
  description: string;
  specialInstructions: string;
  location: {
    address: string;
    city: string;
    state: string;
    zipCode: string;
    latitude: number;
    longitude: number;
  };
}

const BookingDialog: React.FC<BookingDialogProps> = ({
  open,
  onClose,
  provider,
  serviceType = ''
}) => {
  const { t } = useTranslation('bookings');
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<BookingFormData>({
    serviceType: serviceType,
    scheduledDate: null,
    estimatedDuration: 2,
    description: '',
    specialInstructions: '',
    location: {
      address: '',
      city: '',
      state: '',
      zipCode: '',
      latitude: 0,
      longitude: 0
    }
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Create booking mutation
  const createBookingMutation = useMutation({
    mutationFn: (bookingData: any) => apiService.createBooking(bookingData),
    onSuccess: (newBooking: Booking) => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success(t('create.success'));
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || t('create.error'));
    },
  });

  const resetForm = () => {
    setFormData({
      serviceType: serviceType,
      scheduledDate: null,
      estimatedDuration: 2,
      description: '',
      specialInstructions: '',
      location: {
        address: '',
        city: '',
        state: '',
        zipCode: '',
        latitude: 0,
        longitude: 0
      }
    });
    setErrors({});
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.serviceType) {
      newErrors.serviceType = t('create.validation.service_required');
    }
    if (!formData.scheduledDate || isNaN(formData.scheduledDate.getTime())) {
      newErrors.scheduledDate = t('create.validation.date_required');
    }
    if (formData.estimatedDuration < 0.5) {
      newErrors.estimatedDuration = t('create.validation.duration_min');
    }
    if (!formData.description.trim()) {
      newErrors.description = t('create.validation.description_required');
    }
    if (!formData.location.address.trim()) {
      newErrors.address = t('create.validation.address_required');
    }
    if (!formData.location.city.trim()) {
      newErrors.city = t('create.validation.city_required');
    }
    if (!formData.location.state.trim()) {
      newErrors.state = t('create.validation.state_required');
    }
    if (!formData.location.zipCode.trim()) {
      newErrors.zipCode = t('create.validation.zip_required');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const calculateEstimatedCost = (): number => {
    if (!provider?.pricing?.baseRate) return 0;
    return provider.pricing.baseRate * formData.estimatedDuration;
  };

  const handleSubmit = () => {
    if (!validateForm() || !provider) return;

    const bookingData = {
      providerId: provider.id,
      serviceType: formData.serviceType,
      description: formData.description,
      scheduledDate: formData.scheduledDate!.toISOString(),
      estimatedDuration: Math.round(formData.estimatedDuration * 60), // Convert hours to minutes
      totalAmount: calculateEstimatedCost(),
      specialInstructions: formData.specialInstructions || undefined,
      location: formData.location
    };

    createBookingMutation.mutate(bookingData);
  };

  // Get services from the provider's service list
  const availableServices = provider?.services || [];

  const formatServiceName = (service: string) => {
    return service.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (!provider) return null;

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
          <Person />
          {t('create.dialog_title', { provider: provider.businessName })}
        </Box>
      </DialogTitle>
      
      <DialogContent sx={{ pt: 2 }}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Grid container spacing={3}>
            {/* Provider Info */}
            <Grid xs={12}>
              <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1, mb: 2 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {provider.businessName}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Star sx={{ color: 'gold', fontSize: 'small' }} />
                  <Typography variant="body2">
                    {t('create.reviews_count', { rating: provider.rating, count: provider.totalReviews })}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <LocationOn sx={{ fontSize: 'small' }} />
                  <Typography variant="body2">
                    {typeof provider.location === 'object' ? `${provider.location.city}, ${provider.location.state}` : provider.location}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Payment sx={{ fontSize: 'small' }} />
                  <Typography variant="body2">
                    {t('create.rate_per_unit', { rate: provider.pricing?.baseRate || 50, unit: provider.pricing?.rateType || 'hour' })}
                  </Typography>
                </Box>
              </Box>
            </Grid>

            {/* Service Details */}
            <Grid xs={12} md={6}>
              <FormControl fullWidth error={!!errors.serviceType}>
                <InputLabel>{t('create.service_type')}</InputLabel>
                <Select
                  value={formData.serviceType}
                  label={t('create.service_type')}
                  onChange={(e) => setFormData({ ...formData, serviceType: e.target.value })}
                >
                  {availableServices.map(service => (
                    <MenuItem key={service} value={service}>
                      {formatServiceName(service)}
                    </MenuItem>
                  ))}
                </Select>
                {errors.serviceType && (
                  <Typography variant="caption" color="error">
                    {errors.serviceType}
                  </Typography>
                )}
              </FormControl>
            </Grid>

            <Grid xs={12} md={6}>
              <DateTimePicker
                label={t('create.scheduled_datetime')}
                value={formData.scheduledDate}
                onChange={(date) => setFormData({ ...formData, scheduledDate: date as Date | null })}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    fullWidth
                    error={!!errors.scheduledDate}
                    helperText={errors.scheduledDate}
                  />
                )}
                minDateTime={new Date()}
              />
            </Grid>

            <Grid xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label={t('create.duration_hours')}
                value={formData.estimatedDuration}
                onChange={(e) => setFormData({ ...formData, estimatedDuration: parseFloat(e.target.value) || 0 })}
                error={!!errors.estimatedDuration}
                helperText={errors.estimatedDuration}
                inputProps={{ min: 0.5, step: 0.5 }}
              />
            </Grid>

            <Grid xs={12} md={6}>
              <Box sx={{ p: 2, bgcolor: 'primary.50', borderRadius: 1 }}>
                <Typography variant="h6" color="primary">
                  {t('create.estimated_cost_display', { cost: calculateEstimatedCost().toFixed(2) })}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('create.rate_calculation', {
                    rate: provider.pricing?.baseRate || 50,
                    duration: formData.estimatedDuration
                  })}
                </Typography>
              </Box>
            </Grid>

            {/* Service Description */}
            <Grid xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label={t('create.service_description')}
                placeholder={t('create.description_placeholder')}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                error={!!errors.description}
                helperText={errors.description}
              />
            </Grid>

            {/* Special Instructions */}
            <Grid xs={12}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label={t('create.special_instructions')}
                placeholder={t('create.instructions_placeholder')}
                value={formData.specialInstructions}
                onChange={(e) => setFormData({ ...formData, specialInstructions: e.target.value })}
              />
            </Grid>

            {/* Location */}
            <Grid xs={12}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                {t('create.location')}
              </Typography>
            </Grid>

            <Grid xs={12}>
              <TextField
                fullWidth
                label={t('create.address')}
                value={formData.location.address}
                onChange={(e) => setFormData({
                  ...formData,
                  location: { ...formData.location, address: e.target.value }
                })}
                error={!!errors.address}
                helperText={errors.address}
              />
            </Grid>

            <Grid xs={12} md={4}>
              <TextField
                fullWidth
                label={t('create.city')}
                value={formData.location.city}
                onChange={(e) => setFormData({
                  ...formData,
                  location: { ...formData.location, city: e.target.value }
                })}
                error={!!errors.city}
                helperText={errors.city}
              />
            </Grid>

            <Grid xs={12} md={4}>
              <TextField
                fullWidth
                label={t('create.state')}
                value={formData.location.state}
                onChange={(e) => setFormData({
                  ...formData,
                  location: { ...formData.location, state: e.target.value }
                })}
                error={!!errors.state}
                helperText={errors.state}
              />
            </Grid>

            <Grid xs={12} md={4}>
              <TextField
                fullWidth
                label={t('create.zip')}
                value={formData.location.zipCode}
                onChange={(e) => setFormData({
                  ...formData,
                  location: { ...formData.location, zipCode: e.target.value }
                })}
                error={!!errors.zipCode}
                helperText={errors.zipCode}
              />
            </Grid>

            {/* Booking Summary */}
            <Grid xs={12}>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {t('create.booking_summary')}
                </Typography>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  <strong>{t('create.summary_labels.provider')}</strong> {provider.businessName}
                </Typography>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  <strong>{t('create.summary_labels.service')}</strong> {formatServiceName(formData.serviceType)}
                </Typography>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  <strong>{t('create.summary_labels.duration')}</strong> {formData.estimatedDuration} {t('create.hours')}
                </Typography>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  <strong>{t('create.summary_labels.estimated_cost')}</strong> ${calculateEstimatedCost().toFixed(2)}
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </LocalizationProvider>
      </DialogContent>

      <DialogActions sx={{ p: 3 }}>
        <Button
          onClick={onClose}
          disabled={createBookingMutation.isPending}
        >
          {t('actions.cancel')}
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={createBookingMutation.isPending}
          startIcon={createBookingMutation.isPending ? <CircularProgress size={20} /> : <Schedule />}
        >
          {createBookingMutation.isPending ? t('create.creating') : t('create.submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BookingDialog;