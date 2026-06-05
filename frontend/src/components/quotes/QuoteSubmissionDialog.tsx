import React, { useState, useEffect } from 'react';
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
  Card,
  CardContent,
  Divider,
  InputAdornment,
  Alert,
  CircularProgress,
  Chip,
  IconButton
} from '@mui/material';
import {
  SendAndArchive,
  AttachMoney,
  Schedule,
  Description,
  Add,
  Remove,
  LocationOn,
  Person,
  PriorityHigh
} from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { addDays } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { apiService, QuoteRequest, Quote } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

interface QuoteSubmissionDialogProps {
  open: boolean;
  onClose: () => void;
  quoteRequest: QuoteRequest | null;
}

interface PriceBreakdown {
  labor: number;
  materials: number;
  equipment: number;
  other: number;
  tax: number;
}

interface Term {
  item: string;
  description: string;
}

interface QuoteFormData {
  description: string;
  estimatedPrice: number;
  estimatedDuration: number;
  validUntil: Date;
  breakdown: PriceBreakdown;
  terms: Term[];
  notes: string;
}

const QuoteSubmissionDialog: React.FC<QuoteSubmissionDialogProps> = ({
  open,
  onClose,
  quoteRequest
}) => {
  const { t } = useTranslation('quotes');
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<QuoteFormData>({
    description: '',
    estimatedPrice: 0,
    estimatedDuration: 2,
    validUntil: addDays(new Date(), 30),
    breakdown: {
      labor: 0,
      materials: 0,
      equipment: 0,
      other: 0,
      tax: 0
    },
    terms: [],
    notes: ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newTerm, setNewTerm] = useState({ item: '', description: '' });

  useEffect(() => {
    if (quoteRequest && open) {
      setFormData({
        description: `Professional ${quoteRequest.serviceType.replace(/_/g, ' ')} service`,
        estimatedPrice: quoteRequest.budget?.min || 100,
        estimatedDuration: 2,
        validUntil: addDays(new Date(), 30),
        breakdown: {
          labor: Math.round((quoteRequest.budget?.min || 100) * 0.6),
          materials: Math.round((quoteRequest.budget?.min || 100) * 0.3),
          equipment: Math.round((quoteRequest.budget?.min || 100) * 0.1),
          other: 0,
          tax: 0
        },
        terms: [
          { item: 'Payment', description: '50% deposit required, balance due upon completion' },
          { item: 'Timeline', description: 'Work will be completed within agreed timeframe' },
          { item: 'Quality', description: 'All work guaranteed for 30 days' }
        ],
        notes: ''
      });
    }
  }, [quoteRequest, open]);

  useEffect(() => {
    const total = Object.values(formData.breakdown).reduce((sum, val) => sum + val, 0);
    if (total !== formData.estimatedPrice) {
      setFormData(prev => ({ ...prev, estimatedPrice: total }));
    }
  }, [formData.breakdown]);

  const createQuoteMutation = useMutation({
    mutationFn: (quoteData: any) => apiService.createQuote(quoteData),
    onSuccess: (newQuote: Quote) => {
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['quote-requests'] });
      toast.success(t('submission.success'));
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || t('submission.error'));
    },
  });

  const resetForm = () => {
    setFormData({
      description: '',
      estimatedPrice: 0,
      estimatedDuration: 2,
      validUntil: addDays(new Date(), 30),
      breakdown: {
        labor: 0,
        materials: 0,
        equipment: 0,
        other: 0,
        tax: 0
      },
      terms: [],
      notes: ''
    });
    setErrors({});
    setNewTerm({ item: '', description: '' });
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.description.trim()) {
      newErrors.description = t('submission.validation.description_required');
    }
    if (formData.estimatedPrice <= 0) {
      newErrors.estimatedPrice = t('submission.validation.price_greater_than_zero');
    }
    if (formData.estimatedDuration <= 0) {
      newErrors.estimatedDuration = t('submission.validation.duration_greater_than_zero');
    }
    if (!formData.validUntil || formData.validUntil <= new Date()) {
      newErrors.validUntil = t('submission.validation.valid_until_future');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm() || !quoteRequest) return;

    const quoteData = {
      requestId: quoteRequest.id,
      serviceType: quoteRequest.serviceType,
      description: formData.description,
      estimatedPrice: formData.estimatedPrice,
      estimatedDuration: Math.round(formData.estimatedDuration * 60),
      validUntil: formData.validUntil.toISOString(),
      breakdown: formData.breakdown,
      terms: formData.terms,
      notes: formData.notes || undefined
    };

    createQuoteMutation.mutate(quoteData);
  };

  const addTerm = () => {
    if (newTerm.item && newTerm.description) {
      setFormData({
        ...formData,
        terms: [...formData.terms, { ...newTerm }]
      });
      setNewTerm({ item: '', description: '' });
    }
  };

  const removeTerm = (index: number) => {
    setFormData({
      ...formData,
      terms: formData.terms.filter((_, i) => i !== index)
    });
  };

  const updateBreakdown = (field: keyof PriceBreakdown, value: number) => {
    setFormData({
      ...formData,
      breakdown: {
        ...formData.breakdown,
        [field]: Math.max(0, value)
      }
    });
  };

  const formatServiceName = (service: string) => {
    return service.replace(/_/g, ' ').replace(/(^|\s)(\S)/g, (_, s, c) => s + c.toUpperCase());
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'urgent': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'info';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  if (!quoteRequest) return null;

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
          <SendAndArchive />
          {t('submission.title', { service: formatServiceName(quoteRequest.serviceType) })}
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <Grid container spacing={3}>
            {/* Quote Request Info */}
            <Grid item xs={12}>
              <Card sx={{ mb: 3, bgcolor: 'grey.50' }}>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    {t('submission.quote_request_details')}
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Person sx={{ fontSize: 'small' }} />
                        <Typography variant="body2">
                          <strong>{t('submission.service_label')}</strong> {formatServiceName(quoteRequest.serviceType)}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <PriorityHigh sx={{ fontSize: 'small' }} />
                        <Chip
                          label={quoteRequest.urgency.toUpperCase()}
                          size="small"
                          color={getUrgencyColor(quoteRequest.urgency) as any}
                        />
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LocationOn sx={{ fontSize: 'small' }} />
                        <Typography variant="body2">
                          {quoteRequest.location.city}, {quoteRequest.location.state}
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      {quoteRequest.budget && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <AttachMoney sx={{ fontSize: 'small' }} />
                          <Typography variant="body2">
                            <strong>{t('submission.budget_label')}</strong> ${quoteRequest.budget.min} - ${quoteRequest.budget.max}
                          </Typography>
                        </Box>
                      )}
                      <Typography variant="body2" sx={{ mb: 1 }}>
                        <strong>{t('submission.description_label')}</strong> {quoteRequest.description}
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            {/* Quote Description */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label={t('submission.quote_description')}
                placeholder={t('submission.quote_description_placeholder')}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                error={!!errors.description}
                helperText={errors.description}
                InputProps={{
                  startAdornment: <Description sx={{ mr: 1, mt: 1, alignSelf: 'flex-start' }} />
                }}
              />
            </Grid>

            {/* Pricing Breakdown */}
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <AttachMoney />
                {t('submission.pricing_breakdown')}
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={2}>
                  <TextField
                    fullWidth
                    type="number"
                    label={t('submission.labor')}
                    value={formData.breakdown.labor}
                    onChange={(e) => updateBreakdown('labor', parseFloat(e.target.value) || 0)}
                    InputProps={{
                      startAdornment: <InputAdornment position="start">$</InputAdornment>
                    }}
                    inputProps={{ min: 0, step: 10 }}
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField
                    fullWidth
                    type="number"
                    label={t('submission.materials')}
                    value={formData.breakdown.materials}
                    onChange={(e) => updateBreakdown('materials', parseFloat(e.target.value) || 0)}
                    InputProps={{
                      startAdornment: <InputAdornment position="start">$</InputAdornment>
                    }}
                    inputProps={{ min: 0, step: 10 }}
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField
                    fullWidth
                    type="number"
                    label={t('submission.equipment')}
                    value={formData.breakdown.equipment}
                    onChange={(e) => updateBreakdown('equipment', parseFloat(e.target.value) || 0)}
                    InputProps={{
                      startAdornment: <InputAdornment position="start">$</InputAdornment>
                    }}
                    inputProps={{ min: 0, step: 10 }}
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField
                    fullWidth
                    type="number"
                    label={t('submission.other')}
                    value={formData.breakdown.other}
                    onChange={(e) => updateBreakdown('other', parseFloat(e.target.value) || 0)}
                    InputProps={{
                      startAdornment: <InputAdornment position="start">$</InputAdornment>
                    }}
                    inputProps={{ min: 0, step: 10 }}
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <TextField
                    fullWidth
                    type="number"
                    label={t('submission.tax')}
                    value={formData.breakdown.tax}
                    onChange={(e) => updateBreakdown('tax', parseFloat(e.target.value) || 0)}
                    InputProps={{
                      startAdornment: <InputAdornment position="start">$</InputAdornment>
                    }}
                    inputProps={{ min: 0, step: 5 }}
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <Box sx={{
                    p: 2,
                    border: 2,
                    borderColor: 'primary.main',
                    borderRadius: 1,
                    bgcolor: 'primary.50',
                    textAlign: 'center'
                  }}>
                    <Typography variant="h6" color="primary">
                      {t('submission.total')} ${formData.estimatedPrice.toFixed(2)}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </Grid>

            {/* Duration and Valid Until */}
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="number"
                label={t('submission.estimated_duration')}
                value={formData.estimatedDuration}
                onChange={(e) => setFormData({
                  ...formData,
                  estimatedDuration: parseFloat(e.target.value) || 0
                })}
                error={!!errors.estimatedDuration}
                helperText={errors.estimatedDuration}
                InputProps={{
                  startAdornment: <Schedule sx={{ mr: 1 }} />,
                  endAdornment: <InputAdornment position="end">{t('submission.hours')}</InputAdornment>
                }}
                inputProps={{ min: 0.5, step: 0.5 }}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <DateTimePicker
                label={t('submission.quote_valid_until')}
                value={formData.validUntil}
                onChange={(date) => setFormData({ ...formData, validUntil: (date as Date) || addDays(new Date(), 30) })}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    fullWidth
                    error={!!errors.validUntil}
                    helperText={errors.validUntil}
                  />
                )}
                minDateTime={new Date()}
              />
            </Grid>

            {/* Terms and Conditions */}
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                {t('submission.terms_and_conditions')}
              </Typography>

              {/* Add New Term */}
              <Card sx={{ mb: 2, bgcolor: 'grey.50' }}>
                <CardContent>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={3}>
                      <TextField
                        fullWidth
                        size="small"
                        label={t('submission.term_category')}
                        value={newTerm.item}
                        onChange={(e) => setNewTerm({ ...newTerm, item: e.target.value })}
                        placeholder={t('submission.term_category_placeholder')}
                      />
                    </Grid>
                    <Grid item xs={12} md={8}>
                      <TextField
                        fullWidth
                        size="small"
                        label={t('submission.term_description')}
                        value={newTerm.description}
                        onChange={(e) => setNewTerm({ ...newTerm, description: e.target.value })}
                        placeholder={t('submission.term_description_placeholder')}
                      />
                    </Grid>
                    <Grid item xs={12} md={1}>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={addTerm}
                        disabled={!newTerm.item || !newTerm.description}
                      >
                        <Add />
                      </Button>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              {/* Display Terms */}
              {formData.terms.map((term, index) => (
                <Card key={index} sx={{ mb: 1, bgcolor: 'background.paper' }}>
                  <CardContent sx={{ py: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                          {term.item}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {term.description}
                        </Typography>
                      </Box>
                      <IconButton
                        size="small"
                        onClick={() => removeTerm(index)}
                        color="error"
                      >
                        <Remove />
                      </IconButton>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Grid>

            {/* Additional Notes */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label={t('submission.additional_notes')}
                placeholder={t('submission.additional_notes_placeholder')}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </Grid>

            {/* Quote Summary */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Card sx={{ bgcolor: 'primary.50' }}>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    {t('submission.quote_summary')}
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Typography variant="body2" sx={{ mb: 0.5 }}>
                        <strong>{t('submission.service_label')}</strong> {formatServiceName(quoteRequest.serviceType)}
                      </Typography>
                      <Typography variant="body2" sx={{ mb: 0.5 }}>
                        <strong>{t('submission.duration_label')}</strong> {formData.estimatedDuration} {t('submission.hours')}
                      </Typography>
                      <Typography variant="body2">
                        <strong>{t('submission.valid_until_label')}</strong> {formData.validUntil.toLocaleDateString()}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Typography variant="h5" color="primary" sx={{ textAlign: 'right' }}>
                        {t('submission.total')} ${formData.estimatedPrice.toFixed(2)}
                      </Typography>
                      <Typography variant="body2" sx={{ textAlign: 'right' }}>
                        ${(formData.estimatedPrice / formData.estimatedDuration).toFixed(2)}{t('submission.per_hour')}
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </LocalizationProvider>
      </DialogContent>

      <DialogActions sx={{ p: 3 }}>
        <Button
          onClick={onClose}
          disabled={createQuoteMutation.isPending}
        >
          {t('submission.cancel')}
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={createQuoteMutation.isPending}
          startIcon={createQuoteMutation.isPending ? <CircularProgress size={20} /> : <SendAndArchive />}
        >
          {createQuoteMutation.isPending ? t('submission.submitting') : t('submission.submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default QuoteSubmissionDialog;