import React, { useState, useEffect } from 'react';
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
  Divider,
  CircularProgress,
  Alert,
  useTheme,
  alpha
} from '@mui/material';
import Grid from '@mui/material/Unstable_Grid2';
import {
  LocationOn,
  Schedule,
  Payment,
  CheckCircle,
  ArrowForward,
  ArrowBack
} from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { ptBR, enUS } from 'date-fns/locale';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { apiService, Provider, Booking } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { tokens } from '../../theme/theme';
import AddressAutocomplete from '../common/AddressAutocomplete';

interface BookingDialogProps {
  open: boolean;
  onClose: () => void;
  provider: Provider | null;
  serviceType?: string;
  // When re-booking, prefill the location from the original service so the
  // customer doesn't re-type the address (still editable).
  initialLocation?: BookingFormData['location'] | null;
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

const STEPS = [
  { label: 'Serviço', icon: <Schedule sx={{ fontSize: 14 }} /> },
  { label: 'Local', icon: <LocationOn sx={{ fontSize: 14 }} /> },
  { label: 'Confirmar', icon: <CheckCircle sx={{ fontSize: 14 }} /> },
];

const StepIndicator: React.FC<{ currentStep: number }> = ({ currentStep }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0, mb: 3 }}>
      {STEPS.map((step, i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        return (
          <React.Fragment key={i}>
            {/* Step pill */}
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 0.75,
              px: 1.5, py: 0.5,
              borderRadius: tokens.radius.full,
              transition: 'all 0.25s ease',
              ...(active ? {
                bgcolor: tokens.color.terra,
                color: '#fff',
              } : done ? {
                bgcolor: alpha(tokens.color.earth, 0.15),
                color: tokens.color.earth,
              } : {
                bgcolor: isDark ? alpha('#fff', 0.06) : alpha('#000', 0.05),
                color: 'text.disabled',
              })
            }}>
              {done
                ? <CheckCircle sx={{ fontSize: 13 }} />
                : step.icon
              }
              <Typography sx={{
                fontFamily: tokens.font.body,
                fontSize: '0.75rem',
                fontWeight: active ? 600 : 500,
                lineHeight: 1,
              }}>
                {step.label}
              </Typography>
            </Box>

            {/* Connector */}
            {i < STEPS.length - 1 && (
              <Box sx={{
                flex: 1,
                height: '1px',
                bgcolor: done
                  ? tokens.color.earth
                  : isDark ? tokens.color.nightBorder : tokens.color.paperDark,
                transition: 'background-color 0.3s ease',
              }} />
            )}
          </React.Fragment>
        );
      })}
    </Box>
  );
};

const BookingDialog: React.FC<BookingDialogProps> = ({
  open,
  onClose,
  provider,
  serviceType = '',
  initialLocation = null
}) => {
  const { t, i18n } = useTranslation(['bookings', 'providers']);
  const { user } = useAuth();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const queryClient = useQueryClient();
  const dateLocale = i18n.language.startsWith('pt') ? ptBR : enUS;

  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<BookingFormData>({
    serviceType,
    scheduledDate: null,
    estimatedDuration: 2,
    description: '',
    specialInstructions: '',
    location: { address: '', city: '', state: '', zipCode: '', latitude: 0, longitude: 0 }
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // On open, seed serviceType and (for rebook) the original service's location so
  // the customer doesn't re-type the address. Editable afterwards.
  useEffect(() => {
    if (!open) return;
    setFormData(prev => ({
      ...prev,
      serviceType: serviceType || prev.serviceType,
      ...(initialLocation ? { location: { ...initialLocation } } : {}),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Direct hire is modelled as a single-provider quote request: the provider
  // responds with a quote confirming or countering the customer's proposed terms,
  // and the customer accepts before anything is booked. (Unified lifecycle hub.)
  const createRequestMutation = useMutation({
    mutationFn: (requestData: any) => apiService.createQuoteRequest(requestData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-requests'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      toast.success(t('hire_request.success', { provider: provider?.businessName }));
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || error?.response?.data?.error || t('hire_request.error');
      toast.error(msg);
    },
  });

  const resetForm = () => {
    setStep(0);
    setFormData({
      serviceType,
      scheduledDate: null,
      estimatedDuration: 2,
      description: '',
      specialInstructions: '',
      location: { address: '', city: '', state: '', zipCode: '', latitude: 0, longitude: 0 }
    });
    setErrors({});
  };

  const handleClose = () => { onClose(); resetForm(); };

  const validateStep = (s: number): boolean => {
    const newErrors: Record<string, string> = {};
    if (s === 0) {
      if (!formData.serviceType) newErrors.serviceType = t('create.validation.service_required');
      if (!formData.scheduledDate || isNaN(formData.scheduledDate.getTime())) newErrors.scheduledDate = t('create.validation.date_required');
      if (formData.estimatedDuration < 0.5) newErrors.estimatedDuration = t('create.validation.duration_min');
      if (!formData.description.trim()) newErrors.description = t('create.validation.description_required');
    }
    if (s === 1) {
      if (!formData.location.address.trim()) newErrors.address = t('create.validation.address_required');
      else if (formData.location.latitude === 0 || formData.location.longitude === 0) newErrors.address = t('create.validation.address_unresolved');
      if (!formData.location.city.trim()) newErrors.city = t('create.validation.city_required');
      if (!formData.location.state.trim()) newErrors.state = t('create.validation.state_required');
      if (!formData.location.zipCode.trim()) newErrors.zipCode = t('create.validation.zip_required');
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) setStep(s => s + 1);
  };

  const handleBack = () => {
    setErrors({});
    setStep(s => s - 1);
  };

  const calculateEstimatedCost = (): number => {
    if (!provider?.pricing?.baseRate) return 0;
    return provider.pricing.baseRate * formData.estimatedDuration;
  };

  const handleSubmit = () => {
    if (!provider) return;
    const proposedCost = calculateEstimatedCost();
    const requestData = {
      serviceType: formData.serviceType,
      description: formData.specialInstructions
        ? `${formData.description}\n\n${formData.specialInstructions}`
        : formData.description,
      location: formData.location,
      preferredDate: formData.scheduledDate!.toISOString(),
      // Customer's proposed price → budget (min=max). The provider may counter.
      budget: { min: proposedCost, max: proposedCost, currency: 'BRL' },
      urgency: 'medium' as const,
      // Targeting one provider makes this a direct hire (visible only to them).
      targetProviderIds: [provider.id],
      // Duration has no dedicated request field — carry it machine-readably so
      // the provider/hub can display the customer's proposed duration.
      requirements: [{
        category: 'proposed_duration_hours',
        requirement: String(formData.estimatedDuration),
        mandatory: false,
      }],
    };
    createRequestMutation.mutate(requestData);
  };

  const formatServiceName = (service: string) =>
    service.replace(/_/g, ' ').replace(/(^|\s)(\S)/g, (_, s, c) => s + c.toUpperCase());

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  if (!provider) return null;

  const availableServices = provider?.services || [];

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { minHeight: '65vh' } }}
    >
      {/* Header with step indicator built in */}
      <DialogTitle sx={{ pb: 1.5 }}>
        <Typography sx={{
          fontFamily: tokens.font.display,
          fontSize: '1.25rem',
          fontWeight: 500,
          mb: 2,
        }}>
          {t('hire_request.dialog_title', { provider: provider.businessName })}
        </Typography>
        <StepIndicator currentStep={step} />
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ pt: 3 }}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={dateLocale}>
          <AnimatePresence mode="wait">
            {/* Step 0 — Service details */}
            {step === 0 && (
              <motion.div
                key="step0"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Provider info strip */}
                <Box sx={{
                  p: 2, mb: 3,
                  borderRadius: tokens.radius.md,
                  bgcolor: isDark ? alpha(tokens.color.earth, 0.08) : alpha(tokens.color.earth, 0.05),
                  border: `1px solid ${isDark ? tokens.color.nightBorder : alpha(tokens.color.earth, 0.15)}`,
                  display: 'flex', flexWrap: 'wrap', gap: 2.5,
                }}>
                  <Box>
                    <Typography sx={{ fontFamily: tokens.font.display, fontSize: '1rem', fontWeight: 500 }}>
                      {provider.businessName}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      ★ {provider.rating} · {provider.totalReviews} avaliações
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Payment sx={{ fontSize: 15, color: 'text.disabled' }} />
                    <Typography sx={{ fontFamily: tokens.font.mono, fontSize: '0.875rem', color: tokens.color.terra }}>
                      {formatCurrency(provider.pricing?.baseRate || 50)}{t(`providers:card.${provider.pricing?.rateType || 'hourly'}`, '/hora')}
                    </Typography>
                  </Box>
                </Box>

                <Grid container spacing={2.5}>
                  <Grid xs={12} md={6}>
                    <FormControl fullWidth error={!!errors.serviceType}>
                      <InputLabel>{t('create.service_type')}</InputLabel>
                      <Select
                        value={formData.serviceType}
                        label={t('create.service_type')}
                        onChange={(e) => setFormData({ ...formData, serviceType: e.target.value })}
                      >
                        {availableServices.map(service => (
                          <MenuItem key={service} value={service}>{formatServiceName(service)}</MenuItem>
                        ))}
                      </Select>
                      {errors.serviceType && <Typography variant="caption" color="error">{errors.serviceType}</Typography>}
                    </FormControl>
                  </Grid>

                  <Grid xs={12} md={6}>
                    <DateTimePicker
                      label={t('create.scheduled_datetime')}
                      value={formData.scheduledDate}
                      onChange={(date) => setFormData({ ...formData, scheduledDate: date as Date | null })}
                      renderInput={(params) => (
                        <TextField {...params} fullWidth error={!!errors.scheduledDate} helperText={errors.scheduledDate} />
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
                    <Box sx={{
                      p: 2, height: '100%',
                      borderRadius: tokens.radius.md,
                      border: `1px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
                      display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    }}>
                      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.25 }}>
                        {t('hire_request.estimated_cost_caption')}
                      </Typography>
                      <Typography sx={{
                        fontFamily: tokens.font.mono,
                        fontSize: '1.5rem',
                        fontWeight: 600,
                        color: tokens.color.terra,
                      }}>
                        {formatCurrency(calculateEstimatedCost())}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        {formatCurrency(provider.pricing?.baseRate || 50)} × {formData.estimatedDuration}h
                      </Typography>
                    </Box>
                  </Grid>

                  <Grid xs={12}>
                    <TextField
                      fullWidth multiline rows={3}
                      label={t('create.service_description')}
                      placeholder={t('create.description_placeholder')}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      error={!!errors.description}
                      helperText={errors.description}
                    />
                  </Grid>

                  <Grid xs={12}>
                    <TextField
                      fullWidth multiline rows={2}
                      label={t('create.special_instructions')}
                      placeholder={t('create.instructions_placeholder')}
                      value={formData.specialInstructions}
                      onChange={(e) => setFormData({ ...formData, specialInstructions: e.target.value })}
                    />
                  </Grid>

                  <Grid xs={12}>
                    <Alert severity="info" icon={false} sx={{ borderRadius: tokens.radius.sm, py: 0.75 }}>
                      <Typography variant="caption" color="text.secondary">
                        {t('hire_request.terms_note', { provider: provider.businessName })}
                      </Typography>
                    </Alert>
                  </Grid>
                </Grid>
              </motion.div>
            )}

            {/* Step 1 — Location */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <Typography sx={{ fontFamily: tokens.font.display, fontSize: '1.125rem', fontWeight: 500, mb: 2.5 }}>
                  {t('create.location')}
                </Typography>
                <Grid container spacing={2.5}>
                  <Grid xs={12}>
                    <AddressAutocomplete
                      label={t('create.address')}
                      value={formData.location.address}
                      resolved={formData.location.latitude !== 0 && formData.location.longitude !== 0}
                      onResolved={(loc) => setFormData({ ...formData, location: { ...formData.location, ...loc } })}
                      onTextChange={(text) => setFormData({ ...formData, location: { ...formData.location, address: text, latitude: 0, longitude: 0 } })}
                      error={!!errors.address}
                      helperText={errors.address}
                    />
                  </Grid>
                  <Grid xs={12} md={5}>
                    <TextField
                      fullWidth
                      label={t('create.city')}
                      value={formData.location.city}
                      onChange={(e) => setFormData({ ...formData, location: { ...formData.location, city: e.target.value } })}
                      error={!!errors.city}
                      helperText={errors.city}
                    />
                  </Grid>
                  <Grid xs={12} md={4}>
                    <TextField
                      fullWidth
                      label={t('create.state')}
                      value={formData.location.state}
                      onChange={(e) => setFormData({ ...formData, location: { ...formData.location, state: e.target.value } })}
                      error={!!errors.state}
                      helperText={errors.state}
                    />
                  </Grid>
                  <Grid xs={12} md={3}>
                    <TextField
                      fullWidth
                      label={t('create.zip')}
                      value={formData.location.zipCode}
                      onChange={(e) => setFormData({ ...formData, location: { ...formData.location, zipCode: e.target.value } })}
                      error={!!errors.zipCode}
                      helperText={errors.zipCode}
                    />
                  </Grid>
                </Grid>
              </motion.div>
            )}

            {/* Step 2 — Confirm */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <Typography sx={{ fontFamily: tokens.font.display, fontSize: '1.125rem', fontWeight: 500, mb: 2.5 }}>
                  {t('hire_request.summary_title')}
                </Typography>

                <Box sx={{
                  borderRadius: tokens.radius.lg,
                  border: `1px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
                  overflow: 'hidden',
                }}>
                  {[
                    { label: t('create.summary_labels.provider'), value: provider.businessName },
                    { label: t('create.summary_labels.service'), value: formatServiceName(formData.serviceType) },
                    {
                      label: 'Data e Hora',
                      value: formData.scheduledDate?.toLocaleString('pt-BR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) || '—'
                    },
                    { label: t('create.summary_labels.duration'), value: `${formData.estimatedDuration}h` },
                    { label: 'Local', value: `${formData.location.address}, ${formData.location.city}` },
                  ].map((row, i) => (
                    <Box key={i} sx={{
                      display: 'flex', justifyContent: 'space-between',
                      px: 2.5, py: 1.5,
                      borderBottom: `1px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
                    }}>
                      <Typography variant="body2" color="text.secondary">{row.label}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 500, maxWidth: '55%', textAlign: 'right' }}>
                        {row.value}
                      </Typography>
                    </Box>
                  ))}

                  {/* Total row */}
                  <Box sx={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    px: 2.5, py: 2,
                    bgcolor: isDark ? alpha(tokens.color.terra, 0.08) : alpha(tokens.color.terra, 0.05),
                  }}>
                    <Typography sx={{ fontWeight: 600 }}>
                      {t('hire_request.proposed_cost')}
                    </Typography>
                    <Typography sx={{
                      fontFamily: tokens.font.mono,
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      color: tokens.color.terra,
                    }}>
                      {formatCurrency(calculateEstimatedCost())}
                    </Typography>
                  </Box>
                </Box>

                {formData.description && (
                  <Box sx={{ mt: 2, p: 1.5, borderRadius: tokens.radius.sm, bgcolor: isDark ? alpha('#fff', 0.03) : alpha('#000', 0.02) }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Descrição</Typography>
                    <Typography variant="body2">{formData.description}</Typography>
                  </Box>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </LocalizationProvider>
      </DialogContent>

      <Divider />

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        {step === 0 ? (
          <Button onClick={handleClose} sx={{ borderRadius: tokens.radius.full }}>
            {t('actions.cancel')}
          </Button>
        ) : (
          <Button
            startIcon={<ArrowBack fontSize="small" />}
            onClick={handleBack}
            sx={{ borderRadius: tokens.radius.full }}
          >
            Voltar
          </Button>
        )}

        <Box sx={{ flex: 1 }} />

        {step < 2 ? (
          <Button
            variant="contained"
            endIcon={<ArrowForward fontSize="small" />}
            onClick={handleNext}
            sx={{
              bgcolor: tokens.color.terra,
              '&:hover': { bgcolor: tokens.color.terraDark },
              borderRadius: tokens.radius.full,
              px: 3,
            }}
          >
            Continuar
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={createRequestMutation.isPending}
            startIcon={createRequestMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <CheckCircle fontSize="small" />}
            sx={{
              bgcolor: tokens.color.terra,
              '&:hover': { bgcolor: tokens.color.terraDark },
              borderRadius: tokens.radius.full,
              px: 3,
            }}
          >
            {createRequestMutation.isPending ? t('hire_request.sending') : t('hire_request.submit')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default BookingDialog;
