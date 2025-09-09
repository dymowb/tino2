import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Alert,
  Card,
  CardContent,
  Divider,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormControl,
  FormLabel,
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  Undo as RefundIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { useMutation } from '@tanstack/react-query';
import apiService from '../../services/api';
import { toast } from 'react-hot-toast';

interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  escrowStatus: string;
  platformFee: number;
  providerAmount: number;
  booking?: {
    serviceType: string;
    provider: {
      businessName: string;
    };
  };
  createdAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  payment: Payment;
  onRefundSuccess: () => void;
}

const RefundDialog: React.FC<Props> = ({
  open,
  onClose,
  payment,
  onRefundSuccess,
}) => {
  const [refundType, setRefundType] = useState<'full' | 'partial'>('full');
  const [refundAmount, setRefundAmount] = useState<number>(payment.amount / 100);
  const [refundReason, setRefundReason] = useState('');
  const [refundApplicationFee, setRefundApplicationFee] = useState(false);

  const refundMutation = useMutation({
    mutationFn: apiService.refundPayment,
    onSuccess: () => {
      toast.success('Refund processed successfully');
      onRefundSuccess();
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to process refund');
    },
  });

  const handleRefundTypeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const type = event.target.value as 'full' | 'partial';
    setRefundType(type);
    
    if (type === 'full') {
      setRefundAmount(payment.amount / 100);
    } else {
      setRefundAmount(0);
    }
  };

  const handleRefundAmountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const amount = parseFloat(event.target.value);
    if (!isNaN(amount) && amount >= 0 && amount <= payment.amount / 100) {
      setRefundAmount(amount);
    }
  };

  const handleSubmit = () => {
    if (!refundReason.trim()) {
      toast.error('Please provide a reason for the refund');
      return;
    }

    if (refundType === 'partial' && refundAmount <= 0) {
      toast.error('Please enter a valid refund amount');
      return;
    }

    const refundData = {
      amount: refundType === 'full' ? undefined : Math.round(refundAmount * 100),
      reason: refundReason.trim(),
      refundApplicationFee,
      reverseTransfer: true, // Reverse the transfer to provider if applicable
    };

    refundMutation.mutate(payment.id, refundData);
  };

  const formatAmount = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  };

  const maxRefundAmount = payment.amount / 100;
  const platformFeeAmount = payment.platformFee / 100;
  const providerAmount = payment.providerAmount / 100;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <RefundIcon />
          Process Refund
        </Box>
      </DialogTitle>

      <DialogContent>
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <WarningIcon fontSize="small" />
            <Box>
              <Typography variant="subtitle2">Important</Typography>
              <Typography variant="body2">
                This action will refund the payment and may reverse any transfers made to the provider. 
                Please ensure you have a valid reason for processing this refund.
              </Typography>
            </Box>
          </Box>
        </Alert>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>
              Payment Details
            </Typography>
            
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2">Payment ID:</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {payment.id.substring(0, 12)}...
              </Typography>
            </Box>
            
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2">Service:</Typography>
              <Typography variant="body2">
                {payment.booking?.serviceType || 'Service Payment'}
              </Typography>
            </Box>
            
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2">Provider:</Typography>
              <Typography variant="body2">
                {payment.booking?.provider.businessName || 'N/A'}
              </Typography>
            </Box>
            
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2">Status:</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Chip label={payment.status} size="small" />
                <Chip label={payment.escrowStatus} size="small" variant="outlined" />
              </Box>
            </Box>

            <Divider sx={{ my: 2 }} />
            
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2">Total Amount:</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {formatAmount(maxRefundAmount)}
              </Typography>
            </Box>
            
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">Platform Fee:</Typography>
              <Typography variant="body2" color="text.secondary">
                {formatAmount(platformFeeAmount)}
              </Typography>
            </Box>
            
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">Provider Amount:</Typography>
              <Typography variant="body2" color="text.secondary">
                {formatAmount(providerAmount)}
              </Typography>
            </Box>
          </CardContent>
        </Card>

        <FormControl component="fieldset" sx={{ mb: 3 }}>
          <FormLabel component="legend">Refund Type</FormLabel>
          <RadioGroup value={refundType} onChange={handleRefundTypeChange}>
            <FormControlLabel
              value="full"
              control={<Radio />}
              label={`Full Refund (${formatAmount(maxRefundAmount)})`}
            />
            <FormControlLabel
              value="partial"
              control={<Radio />}
              label="Partial Refund"
            />
          </RadioGroup>
        </FormControl>

        {refundType === 'partial' && (
          <TextField
            fullWidth
            label="Refund Amount"
            type="number"
            value={refundAmount}
            onChange={handleRefundAmountChange}
            inputProps={{
              min: 0,
              max: maxRefundAmount,
              step: 0.01,
            }}
            helperText={`Maximum refund amount: ${formatAmount(maxRefundAmount)}`}
            sx={{ mb: 3 }}
          />
        )}

        <TextField
          fullWidth
          label="Reason for Refund"
          multiline
          rows={3}
          value={refundReason}
          onChange={(e) => setRefundReason(e.target.value)}
          placeholder="Please provide a detailed reason for this refund..."
          required
          sx={{ mb: 3 }}
        />

        <FormControlLabel
          control={
            <input
              type="checkbox"
              checked={refundApplicationFee}
              onChange={(e) => setRefundApplicationFee(e.target.checked)}
            />
          }
          label={
            <Box>
              <Typography variant="body2">
                Refund application fee ({formatAmount(platformFeeAmount)})
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Check this to also refund the platform fee to the customer
              </Typography>
            </Box>
          }
        />

        <Alert severity="info" sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <InfoIcon fontSize="small" />
            <Box>
              <Typography variant="body2">
                Processing this refund will:
              </Typography>
              <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                <li>
                  <Typography variant="body2">
                    Refund {formatAmount(refundType === 'full' ? maxRefundAmount : refundAmount)} to the customer's original payment method
                  </Typography>
                </li>
                <li>
                  <Typography variant="body2">
                    Reverse any transfers made to the provider (if applicable)
                  </Typography>
                </li>
                {refundApplicationFee && (
                  <li>
                    <Typography variant="body2">
                      Refund the platform fee of {formatAmount(platformFeeAmount)}
                    </Typography>
                  </li>
                )}
                <li>
                  <Typography variant="body2">
                    Update the payment status to "refunded"
                  </Typography>
                </li>
              </ul>
            </Box>
          </Box>
        </Alert>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={refundMutation.isPending}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="warning"
          disabled={refundMutation.isPending || !refundReason.trim()}
          startIcon={refundMutation.isPending ? <CircularProgress size={16} /> : <RefundIcon />}
        >
          {refundMutation.isPending ? 'Processing...' : 'Process Refund'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RefundDialog;