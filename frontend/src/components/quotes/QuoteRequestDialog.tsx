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
  serviceType = ''
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<QuoteRequestFormData>({
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
      toast.success('Quote request created successfully!');
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to create quote request');
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
      newErrors.serviceType = 'Service type is required';
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
    if (formData.budget.min >= formData.budget.max) {
      newErrors.budget = 'Minimum budget must be less than maximum budget';
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
      expiresAt: formData.expiresAt?.toISOString()
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

  const requirementCategories = [
    'Experience',
    'Certification',
    'Equipment',
    'Insurance',
    'Availability',
    'Special Skills'
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
          Request Service Quotes
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Grid container spacing={3}>
            {/* Service Type */}
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

            {/* Urgency */}
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Urgency Level</InputLabel>
                <Select
                  value={formData.urgency}
                  label="Urgency Level"
                  onChange={(e) => setFormData({ ...formData, urgency: e.target.value as any })}
                  startAdornment={<PriorityHigh sx={{ mr: 1 }} />}
                >
                  <MenuItem value="low">Low - Flexible timeline</MenuItem>
                  <MenuItem value="medium">Medium - Within a week</MenuItem>
                  <MenuItem value="high">High - Within 2-3 days</MenuItem>
                  <MenuItem value="urgent">Urgent - ASAP</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Service Description */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={4}
                label="Service Description"
                placeholder="Please describe the service you need in detail..."
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

            {/* Budget Range */}
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <AttachMoney />
                Budget Range
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
                    { value: 25, label: '$25' },
                    { value: 500, label: '$500' },
                    { value: 1000, label: '$1000' },
                    { value: 2000, label: '$2000+' }
                  ]}
                />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Budget: ${formData.budget.min} - ${formData.budget.max}
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
                label="Preferred Start Date (Optional)"
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
                label="Search Radius (miles)"
                value={formData.searchRadius}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  searchRadius: parseInt(e.target.value) || 25 
                })}
                inputProps={{ min: 5, max: 100, step: 5 }}
                helperText="How far should we search for providers?"
              />
            </Grid>

            {/* Requirements */}
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Special Requirements (Optional)
              </Typography>
              
              {/* Add New Requirement */}
              <Card sx={{ mb: 2, bgcolor: 'grey.50' }}>
                <CardContent>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={3}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Category</InputLabel>
                        <Select
                          value={newRequirement.category}
                          label="Category"
                          onChange={(e) => setNewRequirement({
                            ...newRequirement,
                            category: e.target.value
                          })}
                        >
                          {requirementCategories.map(cat => (
                            <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Requirement"
                        value={newRequirement.requirement}
                        onChange={(e) => setNewRequirement({
                          ...newRequirement,
                          requirement: e.target.value
                        })}
                        placeholder="e.g., Must have plumbing license"
                      />
                    </Grid>
                    <Grid item xs={12} md={2}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Type</InputLabel>
                        <Select
                          value={newRequirement.mandatory ? 'mandatory' : 'preferred'}
                          label="Type"
                          onChange={(e) => setNewRequirement({
                            ...newRequirement,
                            mandatory: e.target.value === 'mandatory'
                          })}
                        >
                          <MenuItem value="preferred">Preferred</MenuItem>
                          <MenuItem value="mandatory">Mandatory</MenuItem>
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
                label="Quote Request Expires"
                value={formData.expiresAt}
                onChange={(date) => setFormData({ ...formData, expiresAt: date as Date | null })}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    fullWidth
                    helperText="When should this request close automatically?"
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
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={createQuoteRequestMutation.isPending}
          startIcon={createQuoteRequestMutation.isPending ? <CircularProgress size={20} /> : <RequestQuote />}
        >
          {createQuoteRequestMutation.isPending ? 'Creating...' : 'Request Quotes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default QuoteRequestDialog;