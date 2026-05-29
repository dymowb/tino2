import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Box, Button, Typography, Alert, CircularProgress, Paper } from '@mui/material';
import { CreditCard } from '@mui/icons-material';
import apiService from '../../services/api';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

// Inner form — must be a child of <Elements> to access useStripe/useElements
const SetupFormInner: React.FC<{ onSuccess: () => void; onCancel: () => void }> = ({ onSuccess, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError('');

    try {
      // Step 1: get SetupIntent clientSecret from our backend
      const { data } = await apiService.post('/payments/setup-intent', {});
      const clientSecret = data.data.clientSecret;

      // Step 2: confirm the SetupIntent — Stripe tokenises the card, we never see raw numbers
      const result = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: elements.getElement(CardElement)! },
      });

      if (result.error) {
        setError(result.error.message || 'Card setup failed');
        return;
      }

      // Step 3: tell our backend to save the paymentMethodId on the user record
      await apiService.post('/payments/save-method', {
        paymentMethodId: result.setupIntent.payment_method,
      });

      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save payment method');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Your card is saved securely via Stripe. We only store a reference — your card number never touches our servers.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <CardElement options={{
          style: {
            base: { fontSize: '16px', color: '#424770', '::placeholder': { color: '#aab7c4' } },
            invalid: { color: '#9e2146' },
          },
        }} />
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button type="submit" variant="contained" startIcon={loading ? <CircularProgress size={16} /> : <CreditCard />} disabled={loading || !stripe}>
          Save Card
        </Button>
        <Button variant="outlined" onClick={onCancel} disabled={loading}>Cancel</Button>
      </Box>
    </Box>
  );
};

interface CardSetupFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

// Outer wrapper — provides the Stripe context (loads Stripe.js once)
const CardSetupForm: React.FC<CardSetupFormProps> = ({ onSuccess, onCancel }) => (
  <Elements stripe={stripePromise}>
    <SetupFormInner onSuccess={onSuccess} onCancel={onCancel} />
  </Elements>
);

export default CardSetupForm;
