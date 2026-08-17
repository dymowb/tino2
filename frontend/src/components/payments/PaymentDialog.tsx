import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Stepper,
  Step,
  StepLabel,
  Alert,
  Card,
  CardContent,
  Divider,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
} from '@mui/material';
import {
  Payment as PaymentIcon,
  Security as SecurityIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { useQuery, useMutation } from '@tanstack/react-query';
import apiService from '../../services/api';
import { toast } from 'react-hot-toast';
import { resetButtonSx } from '../../theme/theme';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_example');

interface Props {
  open: boolean;
  onClose: () => void;
  onPaymentSuccess: () => void;
  bookingId?: string;
  prefilledAmount?: number;
}

interface Booking {
  id: string;
  serviceType: string;
  description: string;
  totalAmount: number;
  scheduledDate: string;
  provider: {
    businessName: string;
  };
  customer: {
    firstName: string;
    lastName: string;
  };
}

const PaymentForm: React.FC<{
  selectedBooking: Booking | null;
  onPaymentSuccess: () => void;
  onClose: () => void;
}> = ({ selectedBooking, onPaymentSuccess, onClose }) => {
  const { t } = useTranslation('payments');
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const createPaymentIntentMutation = useMutation({
    mutationFn: apiService.createPaymentIntent,
    onSuccess: (data) => {
      setClientSecret(data.clientSecret);
    },
    onError: (error: any) => {
      setPaymentError(error.response?.data?.error || t('new_payment.intent_error'));
    },
  });

  useEffect(() => {
    if (selectedBooking) {
      // Amount and currency are derived from the booking on the server, so they are
      // deliberately not sent. Sending `totalAmount * 100` here while the backend also
      // multiplied by 100 is what produced a 100x charge.
      createPaymentIntentMutation.mutate({
        bookingId: selectedBooking.id,
        description: t('new_payment.payment_for_service', { service: selectedBooking.serviceType }),
        metadata: {
          bookingId: selectedBooking.id,
          serviceType: selectedBooking.serviceType,
        },
      });
    }
  }, [selectedBooking]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements || !clientSecret) {
      return;
    }

    setProcessing(true);
    setPaymentError(null);

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setPaymentError(t('new_payment.card_element_not_found'));
      setProcessing(false);
      return;
    }

    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: `${selectedBooking?.customer.firstName} ${selectedBooking?.customer.lastName}`,
          },
        },
      });

      if (error) {
        setPaymentError(error.message || t('new_payment.error'));
      } else if (paymentIntent?.status === 'succeeded') {
        toast.success(t('new_payment.success'));
        onPaymentSuccess();
      }
    } catch (error: any) {
      setPaymentError(error.message || t('new_payment.unexpected_error'));
    } finally {
      setProcessing(false);
    }
  };

  const cardElementOptions = {
    style: {
      base: {
        fontSize: '16px',
        color: '#424770',
        '::placeholder': {
          color: '#aab7c4',
        },
      },
      invalid: {
        color: '#9e2146',
      },
    },
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          {t('new_payment.payment_information')}
        </Typography>

        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <SecurityIcon color="primary" sx={{ mr: 1 }} />
              <Typography variant="subtitle1">
                {t('new_payment.secure_payment')}
              </Typography>
            </Box>
            <Alert severity="info" sx={{ mb: 2 }}>
              {t('new_payment.escrow_info')}
            </Alert>
          </CardContent>
        </Card>

        {selectedBooking && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>
                {t('new_payment.booking_summary')}
              </Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">{t('new_payment.service')}</Typography>
                <Typography variant="body2">{selectedBooking.serviceType}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">{t('new_payment.provider')}</Typography>
                <Typography variant="body2">{selectedBooking.provider.businessName}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2">{t('new_payment.date')}</Typography>
                <Typography variant="body2">
                  {new Date(selectedBooking.scheduledDate).toLocaleDateString()}
                </Typography>
              </Box>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="h6">{t('new_payment.total_amount')}</Typography>
                <Typography variant="h6" color="primary">
                  ${Number(selectedBooking.totalAmount).toFixed(2)}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>
              {t('new_payment.card_details')}
            </Typography>
            <Box sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              p: 2,
              mb: 2,
              backgroundColor: 'background.paper'
            }}>
              <CardElement options={cardElementOptions} />
            </Box>

            {paymentError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {paymentError}
              </Alert>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <SecurityIcon fontSize="small" color="action" />
              <Typography variant="caption" color="text.secondary">
                {t('new_payment.payment_info_secure')}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>

      <DialogActions>
        <Button onClick={onClose} disabled={processing}>
          {t('new_payment.cancel')}
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={!stripe || processing || !clientSecret}
          startIcon={processing ? <CircularProgress size={16} /> : <PaymentIcon />}
        >
          {processing ? t('new_payment.processing') : t('new_payment.pay_amount', { amount: selectedBooking ? Number(selectedBooking.totalAmount).toFixed(2) : '0.00' })}
        </Button>
      </DialogActions>
    </Box>
  );
};

const PaymentDialog: React.FC<Props> = ({
  open,
  onClose,
  onPaymentSuccess,
  bookingId,
  prefilledAmount,
}) => {
  const { t } = useTranslation('payments');
  const [activeStep, setActiveStep] = useState(0);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const currentUser = apiService.getStoredUser();

  const steps = [t('new_payment.steps.select_booking'), t('new_payment.steps.payment_details'), t('new_payment.steps.confirmation')];

  const { data: bookingsData, isLoading: bookingsLoading } = useQuery({
    queryKey: ['bookings', 'confirmed'],
    queryFn: () => apiService.getBookings({
      status: 'confirmed',
      limit: 50,
    }),
    enabled: open && !bookingId,
  });

  const { data: singleBookingData } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => apiService.getBooking(bookingId!),
    enabled: open && !!bookingId,
  });

  useEffect(() => {
    if (singleBookingData) {
      setSelectedBooking(singleBookingData);
      setActiveStep(1);
    }
  }, [singleBookingData]);

  const handleNext = () => {
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const handleBookingSelect = (booking: Booking) => {
    setSelectedBooking(booking);
    handleNext();
  };

  const handleClose = () => {
    setActiveStep(0);
    setSelectedBooking(null);
    onClose();
  };

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <Box>
            <Typography variant="h6" gutterBottom>
              {t('new_payment.select_booking_title')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {t('new_payment.select_booking_subtitle')}
            </Typography>

            {bookingsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : bookingsData?.data?.length === 0 ? (
              <Alert severity="info">
                {t('new_payment.no_bookings_available')}
              </Alert>
            ) : (
              <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                {bookingsData?.data?.map((booking: Booking) => (
                  <Card
                    component="button"
                    type="button"
                    key={booking.id}
                    sx={{
                      ...resetButtonSx,
                      display: 'block',
                      mb: 2,
                      '&:hover': { boxShadow: 3 }
                    }}
                    onClick={() => handleBookingSelect(booking)}
                  >
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography variant="subtitle1" gutterBottom>
                            {booking.serviceType}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" gutterBottom>
                            {booking.description}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                            <Chip
                              label={booking.provider.businessName}
                              size="small"
                              variant="outlined"
                            />
                            <Chip
                              label={new Date(booking.scheduledDate).toLocaleDateString()}
                              size="small"
                              variant="outlined"
                            />
                          </Box>
                        </Box>
                        <Typography variant="h6" color="primary">
                          ${Number(booking.totalAmount).toFixed(2)}
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            )}
          </Box>
        );

      case 1:
        return (
          <Elements stripe={stripePromise}>
            <PaymentForm
              selectedBooking={selectedBooking}
              onPaymentSuccess={onPaymentSuccess}
              onClose={handleClose}
            />
          </Elements>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PaymentIcon />
          {t('new_payment.title')}
        </Box>
      </DialogTitle>

      <DialogContent>
        {!bookingId && (
          <Box sx={{ mb: 3 }}>
            <Stepper activeStep={activeStep}>
              {steps.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          </Box>
        )}

        {renderStepContent()}
      </DialogContent>

      {activeStep === 0 && !bookingId && (
        <DialogActions>
          <Button onClick={handleClose}>{t('new_payment.cancel')}</Button>
        </DialogActions>
      )}

      {activeStep === 1 && activeStep > 0 && !bookingId && (
        <DialogActions>
          <Button onClick={handleBack}>{t('new_payment.back')}</Button>
        </DialogActions>
      )}
    </Dialog>
  );
};

export default PaymentDialog;