import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  Chip,
  Slider,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  IconButton
} from '@mui/material';
import {
  RequestQuote,
  LocationOn,
  Schedule,
  AttachMoney,
  Description,
  Add,
  Close,
  PriorityHigh
} from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { addDays } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { apiService, QuoteRequest } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

interface QuoteRequestDialogProps {
  open: boolean;
  onClose: () => void;
  serviceType?: string;
  providerName?: string;
  /** When set, the request is targeted at this specific provider (not broadcast). */
  providerId?: string;
  initialDescription?: string;
}

interface Requirement {
  category: string;
  requirement: string;
  mandatory: boolean;
}

interface QuoteRequestFormData {
  serviceType: string;
  description: string;
  location: {
    address: string;
    city: string;
    state: string;
    zipCode: string;
    latitude: number;
    longitude: number;
  };
  preferredDate: Date | null;
  budget: {
    min: number;
    max: number;
    currency: string;
  };
  urgency: 'low' | 'medium' | 'high' | 'urgent';
  requirements: Requirement[];
  searchRadius: number;
  expiresAt: Date | null;
}

const QuoteRequestDialog: React.FC<QuoteRequestDialogProps> = ({
  open,
  onClose,
  serviceType = '',
  providerName,
  providerId,
  initialDescription = '',
}) => {
  const { t } = useTranslation('quotes');
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<QuoteRequestFormData>({
    serviceType: serviceType,
    description: initialDescription,
    location: {
      address: '',
      city: '',
      state: '',
      zipCode: '',
      latitude: 0,
      longitude: 0
    },
    preferredDate: null,
    budget: {
      min: 50,
      max: 500,
      currency: 'USD'
    },
    urgency: 'medium',
    requirements: [],
    searchRadius: 25,
    expiresAt: addDays(new Date(), 7)
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newRequirement, setNewRequirement] = useState({
    category: '',
    requirement: '',
    mandatory: false
  });

  const createQuoteRequestMutation = useMutation({
    mutationFn: (requestData: any) => apiService.createQuoteRequest(requestData),
    onSuccess: (newRequest: QuoteRequest) => {
      queryClient.invalidateQueries({ queryKey: ['quote-requests'] });
      toast.success(t('request.success'));
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || t('request.error'));
    },
  });

  const resetForm = () => {
    setFormData({
      serviceType: serviceType,
      description: '',
      location: {
        address: '',
        city: '',
        state: '',
        zipCode: '',
        latitude: 0,
        longitude: 0
      },
      preferredDate: null,
      budget: {
        min: 50,
        max: 500,
        currency: 'USD'
      },
      urgency: 'medium',
      requirements: [],
      searchRadius: 25,
      expiresAt: addDays(new Date(), 7)
    });
    setErrors({});
    setNewRequirement({ category: '', requirement: '', mandatory: false });
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.serviceType) {
      newErrors.serviceType = t('request.validation.service_type_required');
    }
    if (!formData.description.trim()) {
      newErrors.description = t('request.validation.description_required');
    }
    if (!formData.location.address.trim()) {
      newErrors.address = t('request.validation.address_required');
    }
    if (!formData.location.city.trim()) {
      newErrors.city = t('request.validation.city_required');
    }
    if (!formData.location.state.trim()) {
      newErrors.state = t('request.validation.state_required');
    }
    if (!formData.location.zipCode.trim()) {
      newErrors.zipCode = t('request.validation.zip_required');
    }
    if (formData.budget.min >= formData.budget.max) {
      newErrors.budget = t('request.validation.budget_min_max');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    const requestData = {
      serviceType: formData.serviceType,
      description: formData.description,
      location: formData.location,
      preferredDate: formData.preferredDate?.toISOString(),
      budget: formData.budget,
      urgency: formData.urgency,
      requirements: formData.requirements,
      searchRadius: formData.searchRadius,
      expiresAt: formData.expiresAt?.toISOString(),
      // Target the specific provider when launched from a provider card; otherwise broadcast.
      ...(providerId ? { targetProviderIds: [providerId] } : {}),
    };

    createQuoteRequestMutation.mutate(requestData);
  };

  const addRequirement = () => {
    if (newRequirement.category && newRequirement.requirement) {
      setFormData({
        ...formData,
        requirements: [...formData.requirements, { ...newRequirement }]
      });
      setNewRequirement({ category: '', requirement: '', mandatory: false });
    }
  };

  const removeRequirement = (index: number) => {
    setFormData({
      ...formData,
      requirements: formData.requirements.filter((_, i) => i !== index)
    });
  };

  const availableServices = [
    t('request.services.house_cleaning'),
    t('request.services.deep_cleaning'),
    t('request.services.plumbing'),
    t('request.services.electrical'),
    t('request.services.carpentry'),
    t('request.services.painting'),
    t('request.services.gardening'),
    t('request.services.hvac'),
    t('request.services.appliance_repair'),
    t('request.services.pest_control'),
  ];

  const requirementCategories = [
    { value: 'experience', label: t('request.requirement_categories.experience') },
    { value: 'certification', label: t('request.requirement_categories.certification') },
    { value: 'equipment', label: t('request.requirement_categories.equipment') },
    { value: 'insurance', label: t('request.requirement_categories.insurance') },
    { value: 'availability', label: t('request.requirement_categories.availability') },
    { value: 'special_skills', label: t('request.requirement_categories.special_skills') }
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { minHeight: '80vh' } }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <RequestQuote />
          {providerName ? t('request.title_provider', { name: providerName }) : t('request.title')}
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Grid container spacing={3}>
            {/* Service Type */}
            <Grid item xs={12} md={6}>
              <FormControl fullWidth error={!!errors.serviceType}>
                <InputLabel>{t('request.service_type')}</InputLabel>
                <Select
                  value={formData.serviceType}
                  label={t('request.service_type')}
                  onChange={(e) => setFormData({ ...formData, serviceType: e.target.value })}
                >
                  {availableServices.map(service => (
                    <MenuItem key={service} value={service}>
                      {service}
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

            {/* Urgency */}
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>{t('request.urgency_level')}</InputLabel>
                <Select
                  value={formData.urgency}
                  label={t('request.urgency_level')}
                  onChange={(e) => setFormData({ ...formData, urgency: e.target.value as any })}
                  startAdornment={<PriorityHigh sx={{ mr: 1 }} />}
                >
                  <MenuItem value="low">{t('request.urgency_low')}</MenuItem>
                  <MenuItem value="medium">{t('request.urgency_medium')}</MenuItem>
                  <MenuItem value="high">{t('request.urgency_high')}</MenuItem>
                  <MenuItem value="urgent">{t('request.urgency_urgent')}</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Service Description */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={4}
                label={t('request.description')}
                placeholder={t('request.description_placeholder')}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                error={!!errors.description}
                helperText={errors.description}
                InputProps={{
                  startAdornment: <Description sx={{ mr: 1, mt: 1, alignSelf: 'flex-start' }} />
                }}
              />
            </Grid>

            {/* Location */}
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <LocationOn />
                {t('request.location')}
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label={t('request.street_address')}
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
                label={t('request.city')}
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
                label={t('request.state')}
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
                label={t('request.zip_code')}
                value={formData.location.zipCode}
                onChange={(e) => setFormData({
                  ...formData,
                  location: { ...formData.location, zipCode: e.target.value }
                })}
                error={!!errors.zipCode}
                helperText={errors.zipCode}
              />
            </Grid>

            {/* Budget Range */}
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <AttachMoney />
                {t('request.budget_range')}
              </Typography>
              <Box sx={{ px: 2 }}>
                <Slider
                  value={[formData.budget.min, formData.budget.max]}
                  onChange={(_, newValue) => {
                    const [min, max] = newValue as number[];
                    setFormData({
                      ...formData,
                      budget: { ...formData.budget, min, max }
                    });
                  }}
                  valueLabelDisplay="on"
                  min={25}
                  max={2000}
                  step={25}
                  marks={[
                    { value: 25, label: 'R$25' },
                    { value: 500, label: 'R$500' },
                    { value: 1000, label: 'R$1000' },
                    { value: 2000, label: 'R$2000+' }
                  ]}
                />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {t('request.budget_display', { min: formData.budget.min, max: formData.budget.max })}
                </Typography>
                {errors.budget && (
                  <Typography variant="caption" color="error">
                    {errors.budget}
                  </Typography>
                )}
              </Box>
            </Grid>

            {/* Preferred Date */}
            <Grid item xs={12} md={6}>
              <DateTimePicker
                label={t('request.preferred_start_date')}
                value={formData.preferredDate}
                onChange={(date) => setFormData({ ...formData, preferredDate: date as Date | null })}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    fullWidth
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: <Schedule sx={{ mr: 1 }} />
                    }}
                  />
                )}
                minDateTime={new Date()}
              />
            </Grid>

            {/* Search Radius */}
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label={t('request.search_radius')}
                value={formData.searchRadius}
                onChange={(e) => setFormData({
                  ...formData,
                  searchRadius: parseInt(e.target.value) || 25
                })}
                inputProps={{ min: 5, max: 100, step: 5 }}
                helperText={t('request.search_radius_help')}
              />
            </Grid>

            {/* Requirements */}
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                {t('request.special_requirements')}
              </Typography>

              {/* Add New Requirement */}
              <Card sx={{ mb: 2, bgcolor: 'grey.50' }}>
                <CardContent>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={3}>
                      <FormControl fullWidth size="small">
                        <InputLabel>{t('request.category')}</InputLabel>
                        <Select
                          value={newRequirement.category}
                          label={t('request.category')}
                          onChange={(e) => setNewRequirement({
                            ...newRequirement,
                            category: e.target.value
                          })}
                        >
                          {requirementCategories.map(cat => (
                            <MenuItem key={cat.value} value={cat.value}>{cat.label}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        size="small"
                        label={t('request.requirement')}
                        value={newRequirement.requirement}
                        onChange={(e) => setNewRequirement({
                          ...newRequirement,
                          requirement: e.target.value
                        })}
                        placeholder={t('request.requirement_placeholder')}
                      />
                    </Grid>
                    <Grid item xs={12} md={2}>
                      <FormControl fullWidth size="small">
                        <InputLabel>{t('request.type')}</InputLabel>
                        <Select
                          value={newRequirement.mandatory ? 'mandatory' : 'preferred'}
                          label={t('request.type')}
                          onChange={(e) => setNewRequirement({
                            ...newRequirement,
                            mandatory: e.target.value === 'mandatory'
                          })}
                        >
                          <MenuItem value="preferred">{t('request.preferred')}</MenuItem>
                          <MenuItem value="mandatory">{t('request.mandatory')}</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} md={1}>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={addRequirement}
                        disabled={!newRequirement.category || !newRequirement.requirement}
                      >
                        <Add />
                      </Button>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              {/* Display Requirements */}
              {formData.requirements.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {formData.requirements.map((req, index) => (
                    <Chip
                      key={index}
                      label={`${req.category}: ${req.requirement}`}
                      color={req.mandatory ? 'error' : 'primary'}
                      variant={req.mandatory ? 'filled' : 'outlined'}
                      onDelete={() => removeRequirement(index)}
                      deleteIcon={<Close />}
                    />
                  ))}
                </Box>
              )}
            </Grid>

            {/* Expires At */}
            <Grid item xs={12} md={6}>
              <DateTimePicker
                label={t('request.quote_expires')}
                value={formData.expiresAt}
                onChange={(date) => setFormData({ ...formData, expiresAt: date as Date | null })}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    fullWidth
                    helperText={t('request.expires_help')}
                  />
                )}
                minDateTime={addDays(new Date(), 1)}
              />
            </Grid>
          </Grid>
        </LocalizationProvider>
      </DialogContent>

      <DialogActions sx={{ p: 3 }}>
        <Button
          onClick={onClose}
          disabled={createQuoteRequestMutation.isPending}
        >
          {t('request.cancel')}
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={createQuoteRequestMutation.isPending}
          startIcon={createQuoteRequestMutation.isPending ? <CircularProgress size={20} /> : <RequestQuote />}
        >
          {createQuoteRequestMutation.isPending ? t('request.creating') : t('request.submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default QuoteRequestDialog;