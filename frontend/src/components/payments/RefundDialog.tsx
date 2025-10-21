import React, { useState } from 'react';
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
  const { t } = useTranslation('payments');
  const [refundType, setRefundType] = useState<'full' | 'partial'>('full');
  const [refundAmount, setRefundAmount] = useState<number>(payment.amount / 100);
  const [refundReason, setRefundReason] = useState('');
  const [refundApplicationFee, setRefundApplicationFee] = useState(false);

  const refundMutation = useMutation({
    mutationFn: ({ paymentId, refundData }: { paymentId: string; refundData: any }) =>
      apiService.refundPayment(paymentId, refundData),
    onSuccess: () => {
      toast.success(t('refund.success'));
      onRefundSuccess();
      onClose();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || t('refund.error'));
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
      toast.error(t('refund.validation.reason_required'));
      return;
    }

    if (refundType === 'partial' && refundAmount <= 0) {
      toast.error(t('refund.validation.invalid_amount'));
      return;
    }

    const refundData = {
      amount: refundType === 'full' ? undefined : Math.round(refundAmount * 100),
      reason: refundReason.trim(),
      refundApplicationFee,
      reverseTransfer: true, // Reverse the transfer to provider if applicable
    };

    refundMutation.mutate({ paymentId: payment.id, refundData });
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
          {t('refund.title')}
        </Box>
      </DialogTitle>

      <DialogContent>
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <WarningIcon fontSize="small" />
            <Box>
              <Typography variant="subtitle2">{t('refund.warning_title')}</Typography>
              <Typography variant="body2">
                {t('refund.warning_text')}
              </Typography>
            </Box>
          </Box>
        </Alert>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>
              {t('refund.payment_details')}
            </Typography>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2">{t('refund.payment_id')}</Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {payment.id.substring(0, 12)}...
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2">{t('refund.service')}</Typography>
              <Typography variant="body2">
                {payment.booking?.serviceType || t('refund.service_payment')}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2">{t('refund.provider')}</Typography>
              <Typography variant="body2">
                {payment.booking?.provider.businessName || 'N/A'}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2">{t('refund.status')}</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Chip label={payment.status} size="small" />
                <Chip label={payment.escrowStatus} size="small" variant="outlined" />
              </Box>
            </Box>

            <Divider sx={{ my: 2 }} />

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2">{t('refund.total_amount')}</Typography>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {formatAmount(maxRefundAmount)}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">{t('refund.platform_fee')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {formatAmount(platformFeeAmount)}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">{t('refund.provider_amount')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {formatAmount(providerAmount)}
              </Typography>
            </Box>
          </CardContent>
        </Card>

        <FormControl component="fieldset" sx={{ mb: 3 }}>
          <FormLabel component="legend">{t('refund.refund_type')}</FormLabel>
          <RadioGroup value={refundType} onChange={handleRefundTypeChange}>
            <FormControlLabel
              value="full"
              control={<Radio />}
              label={t('refund.full_refund', { amount: formatAmount(maxRefundAmount) })}
            />
            <FormControlLabel
              value="partial"
              control={<Radio />}
              label={t('refund.partial_refund')}
            />
          </RadioGroup>
        </FormControl>

        {refundType === 'partial' && (
          <TextField
            fullWidth
            label={t('refund.refund_amount')}
            type="number"
            value={refundAmount}
            onChange={handleRefundAmountChange}
            inputProps={{
              min: 0,
              max: maxRefundAmount,
              step: 0.01,
            }}
            helperText={t('refund.max_refund_amount', { amount: formatAmount(maxRefundAmount) })}
            sx={{ mb: 3 }}
          />
        )}

        <TextField
          fullWidth
          label={t('refund.reason')}
          multiline
          rows={3}
          value={refundReason}
          onChange={(e) => setRefundReason(e.target.value)}
          placeholder={t('refund.reason_placeholder')}
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
                {t('refund.refund_app_fee', { amount: formatAmount(platformFeeAmount) })}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t('refund.refund_app_fee_help')}
              </Typography>
            </Box>
          }
        />

        <Alert severity="info" sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <InfoIcon fontSize="small" />
            <Box>
              <Typography variant="body2">
                {t('refund.processing_info')}
              </Typography>
              <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                <li>
                  <Typography variant="body2">
                    {t('refund.info_customer_refund', { amount: formatAmount(refundType === 'full' ? maxRefundAmount : refundAmount) })}
                  </Typography>
                </li>
                <li>
                  <Typography variant="body2">
                    {t('refund.info_reverse_transfer')}
                  </Typography>
                </li>
                {refundApplicationFee && (
                  <li>
                    <Typography variant="body2">
                      {t('refund.info_platform_fee', { amount: formatAmount(platformFeeAmount) })}
                    </Typography>
                  </li>
                )}
                <li>
                  <Typography variant="body2">
                    {t('refund.info_update_status')}
                  </Typography>
                </li>
              </ul>
            </Box>
          </Box>
        </Alert>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={refundMutation.isPending}>
          {t('refund.cancel')}
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="warning"
          disabled={refundMutation.isPending || !refundReason.trim()}
          startIcon={refundMutation.isPending ? <CircularProgress size={16} /> : <RefundIcon />}
        >
          {refundMutation.isPending ? t('refund.processing') : t('refund.submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RefundDialog;