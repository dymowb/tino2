import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
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
      toast.success('Booking created successfully!');
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to create booking');
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
      newErrors.serviceType = 'Service type is required';
    }
    if (!formData.scheduledDate) {
      newErrors.scheduledDate = 'Scheduled date is required';
    }
    if (formData.estimatedDuration < 0.5) {
      newErrors.estimatedDuration = 'Duration must be at least 30 minutes';
    }
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }
    if (!formData.location.address.trim()) {
      newErrors.address = 'Address is required';
    }
    if (!formData.location.city.trim()) {
      newErrors.city = 'City is required';
    }
    if (!formData.location.state.trim()) {
      newErrors.state = 'State is required';
    }
    if (!formData.location.zipCode.trim()) {
      newErrors.zipCode = 'ZIP code is required';
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
      estimatedDuration: formData.estimatedDuration,
      totalAmount: calculateEstimatedCost(),
      specialInstructions: formData.specialInstructions || undefined,
      location: formData.location
    };

    createBookingMutation.mutate(bookingData);
  };

  const availableServices = [
    'house_cleaning',
    'deep_cleaning',
    'plumbing',
    'electrical',
    'carpentry',
    'painting',
    'gardening',
    'hvac',
    'appliance_repair',
    'pest_control'
  ];

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
          Book Service with {provider.businessName}
        </Box>
      </DialogTitle>
      
      <DialogContent sx={{ pt: 2 }}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Grid container spacing={3}>
            {/* Provider Info */}
            <Grid item xs={12}>
              <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1, mb: 2 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {provider.businessName}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Star sx={{ color: 'gold', fontSize: 'small' }} />
                  <Typography variant="body2">
                    {provider.rating} ({provider.totalReviews} reviews)
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <LocationOn sx={{ fontSize: 'small' }} />
                  <Typography variant="body2">
                    {provider.location.city}, {provider.location.state}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Payment sx={{ fontSize: 'small' }} />
                  <Typography variant="body2">
                    ${provider.pricing?.baseRate || 50}/{provider.pricing?.rateType || 'hour'}
                  </Typography>
                </Box>
              </Box>
            </Grid>

            {/* Service Details */}
            <Grid item xs={12} md={6}>
              <FormControl fullWidth error={!!errors.serviceType}>
                <InputLabel>Service Type</InputLabel>
                <Select
                  value={formData.serviceType}
                  label="Service Type"
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

            <Grid item xs={12} md={6}>
              <DateTimePicker
                label="Scheduled Date & Time"
                value={formData.scheduledDate}
                onChange={(date) => setFormData({ ...formData, scheduledDate: date })}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    error: !!errors.scheduledDate,
                    helperText: errors.scheduledDate
                  }
                }}
                minDateTime={new Date()}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label="Estimated Duration (hours)"
                value={formData.estimatedDuration}
                onChange={(e) => setFormData({ ...formData, estimatedDuration: parseFloat(e.target.value) || 0 })}
                error={!!errors.estimatedDuration}
                helperText={errors.estimatedDuration}
                inputProps={{ min: 0.5, step: 0.5 }}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <Box sx={{ p: 2, bgcolor: 'primary.50', borderRadius: 1 }}>
                <Typography variant="h6" color="primary">
                  Estimated Cost: ${calculateEstimatedCost().toFixed(2)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ${provider.pricing?.baseRate || 50} × {formData.estimatedDuration} hours
                </Typography>
              </Box>
            </Grid>

            {/* Service Description */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Service Description"
                placeholder="Please describe the service you need..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                error={!!errors.description}
                helperText={errors.description}
              />
            </Grid>

            {/* Special Instructions */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Special Instructions (Optional)"
                placeholder="Any special instructions or requirements..."
                value={formData.specialInstructions}
                onChange={(e) => setFormData({ ...formData, specialInstructions: e.target.value })}
              />
            </Grid>

            {/* Location */}
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Service Location
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Street Address"
                value={formData.location.address}
                onChange={(e) => setFormData({
                  ...formData,
                  location: { ...formData.location, address: e.target.value }
                })}
                error={!!errors.address}
                helperText={errors.address}
              />
            </Grid>

            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="City"
                value={formData.location.city}
                onChange={(e) => setFormData({
                  ...formData,
                  location: { ...formData.location, city: e.target.value }
                })}
                error={!!errors.city}
                helperText={errors.city}
              />
            </Grid>

            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="State"
                value={formData.location.state}
                onChange={(e) => setFormData({
                  ...formData,
                  location: { ...formData.location, state: e.target.value }
                })}
                error={!!errors.state}
                helperText={errors.state}
              />
            </Grid>

            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="ZIP Code"
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
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  Booking Summary
                </Typography>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  <strong>Provider:</strong> {provider.businessName}
                </Typography>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  <strong>Service:</strong> {formatServiceName(formData.serviceType)}
                </Typography>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  <strong>Duration:</strong> {formData.estimatedDuration} hours
                </Typography>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  <strong>Estimated Cost:</strong> ${calculateEstimatedCost().toFixed(2)}
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
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={createBookingMutation.isPending}
          startIcon={createBookingMutation.isPending ? <CircularProgress size={20} /> : <Schedule />}
        >
          {createBookingMutation.isPending ? 'Creating...' : 'Create Booking'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BookingDialog;