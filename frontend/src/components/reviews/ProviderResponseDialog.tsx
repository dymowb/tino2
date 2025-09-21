import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Rating,
  Avatar,
  Chip,
  CircularProgress,
  Alert,
  Divider
} from '@mui/material';
import {
  Reply,
  Star,
  Person,
  Close,
  Send
} from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { apiService } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

interface ProviderResponseDialogProps {
  open: boolean;
  onClose: () => void;
  review: any;
}

const ProviderResponseDialog: React.FC<ProviderResponseDialogProps> = ({
  open,
  onClose,
  review
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [response, setResponse] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Add provider response mutation
  const addResponseMutation = useMutation({
    mutationFn: ({ reviewId, response }: { reviewId: string; response: string }) =>
      apiService.addProviderResponse(reviewId, response),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['provider-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['my-provider-reviews'] });
      toast.success('Response submitted successfully!');
      onClose();
      setResponse('');
      setErrors({});
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to submit response');
    },
  });

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!response.trim()) {
      newErrors.response = 'Response is required';
    }
    if (response.length < 10) {
      newErrors.response = 'Response must be at least 10 characters';
    }
    if (response.length > 1000) {
      newErrors.response = 'Response cannot exceed 1000 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm() || !review) return;

    addResponseMutation.mutate({
      reviewId: review.id,
      response: response.trim()
    });
  };

  const handleClose = () => {
    setResponse('');
    setErrors({});
    onClose();
  };

  if (!review) return null;

  const criteriaLabels = {
    quality: 'Quality',
    timeliness: 'Timeliness',
    communication: 'Communication',
    professionalism: 'Professionalism',
    value: 'Value'
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { minHeight: '60vh' } }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Reply color="primary" />
          Respond to Customer Review
          <Box sx={{ ml: 'auto' }}>
            <Button onClick={handleClose} size="small">
              <Close />
            </Button>
          </Box>
        </Box>
      </DialogTitle>
      
      <DialogContent sx={{ pt: 2 }}>
        {/* Review Display */}
        <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
            <Avatar sx={{ bgcolor: 'secondary.main' }}>
              <Person />
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  {review.isAnonymous ? 'Anonymous Customer' : review.customer?.firstName || 'Customer'}
                </Typography>
                <Chip 
                  label={`${review.rating} stars`}
                  size="small"
                  color="primary"
                  icon={<Star />}
                />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {new Date(review.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </Typography>
              <Rating value={review.rating} readOnly size="small" sx={{ mb: 1 }} />
            </Box>
          </Box>

          <Typography variant="h6" sx={{ mb: 1 }}>
            {review.title}
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {review.comment}
          </Typography>

          {/* Criteria Breakdown */}
          {review.criteria && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Detailed Ratings:
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {Object.entries(review.criteria).map(([key, value]) => (
                  <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2">
                      {`${criteriaLabels[key as keyof typeof criteriaLabels]}: ${Number(value)}/5`}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </>
          )}
        </Box>

        {/* Check if response already exists */}
        {review.providerResponse && (
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              <strong>You have already responded to this review.</strong>
            </Typography>
            <Box sx={{ mt: 1, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Your response ({new Date(review.providerResponse.createdAt).toLocaleDateString()}):
              </Typography>
              <Typography variant="body1">
                {review.providerResponse.response}
              </Typography>
            </Box>
          </Alert>
        )}

        {/* Response Form */}
        {!review.providerResponse && (
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Your Response
            </Typography>
            
            <TextField
              fullWidth
              multiline
              rows={4}
              label="Response to Customer"
              placeholder="Thank your customer and address their feedback professionally..."
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              error={!!errors.response}
              helperText={errors.response || `${response.length}/1000 characters`}
              inputProps={{ maxLength: 1000 }}
              sx={{ mb: 2 }}
            />

            <Alert severity="info">
              <Typography variant="body2">
                <strong>Response Guidelines:</strong>
              </Typography>
              <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                <li>Thank the customer for their feedback</li>
                <li>Address any concerns professionally</li>
                <li>Keep it concise and constructive</li>
                <li>Avoid arguing or being defensive</li>
                <li>Show how you're improving based on feedback</li>
              </ul>
            </Alert>
          </Box>
        )}

        {/* Service Details */}
        {review.booking && (
          <Box sx={{ mt: 3, p: 2, bgcolor: 'primary.50', borderRadius: 1 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Service Details:
            </Typography>
            <Typography variant="body2">
              <strong>Service:</strong> {review.booking.serviceType?.replace('_', ' ')} | 
              <strong> Date:</strong> {new Date(review.booking.scheduledDate).toLocaleDateString()} | 
              <strong> Amount:</strong> ${review.booking.totalAmount}
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 3 }}>
        <Button 
          onClick={handleClose}
          disabled={addResponseMutation.isPending}
        >
          Cancel
        </Button>
        {!review.providerResponse && (
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={addResponseMutation.isPending}
            startIcon={addResponseMutation.isPending ? <CircularProgress size={20} /> : <Send />}
          >
            {addResponseMutation.isPending ? 'Submitting...' : 'Submit Response'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ProviderResponseDialog;