import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Alert,
  Typography,
  Checkbox,
  FormControlLabel,
  TextField,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Warning as WarningIcon,
  DeleteForever,
  CheckCircle,
} from '@mui/icons-material';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import apiService from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

interface AccountDeletionDialogProps {
  open: boolean;
  onClose: () => void;
}

const AccountDeletionDialog: React.FC<AccountDeletionDialogProps> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [confirmStep, setConfirmStep] = useState(1);
  const [confirmText, setConfirmText] = useState('');
  const [acknowledgements, setAcknowledgements] = useState({
    dataLoss: false,
    noRecovery: false,
    activeBookings: false,
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => apiService.deleteAccount(),
    onSuccess: () => {
      toast.success('Account deletion initiated. Your account will be deactivated.');
      handleClose();
      // Log out and redirect to home page
      logout();
      navigate('/');
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || 'Failed to delete account';
      toast.error(errorMessage);
    },
  });

  const handleClose = () => {
    setConfirmStep(1);
    setConfirmText('');
    setAcknowledgements({
      dataLoss: false,
      noRecovery: false,
      activeBookings: false,
    });
    onClose();
  };

  const canProceedToStep2 = () => {
    return (
      acknowledgements.dataLoss &&
      acknowledgements.noRecovery &&
      acknowledgements.activeBookings
    );
  };

  const canConfirmDeletion = () => {
    return confirmText.toUpperCase() === 'DELETE MY ACCOUNT';
  };

  const handleDeleteAccount = () => {
    if (canConfirmDeletion()) {
      deleteAccountMutation.mutate();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
          <WarningIcon />
          <Typography variant="h6">Delete Account</Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        {confirmStep === 1 && (
          <Box>
            <Alert severity="error" sx={{ mb: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
                Warning: This action will permanently delete your account
              </Typography>
              <Typography variant="body2">
                Your account will be deactivated immediately and scheduled for permanent deletion after
                30 days. During this grace period, you may contact support to recover your account.
              </Typography>
            </Alert>

            <Typography variant="h6" sx={{ mb: 2 }}>
              What will happen:
            </Typography>

            <List>
              <ListItem>
                <ListItemIcon>
                  <DeleteForever color="error" />
                </ListItemIcon>
                <ListItemText
                  primary="All your personal data will be deleted"
                  secondary="Including profile information, settings, and preferences"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <DeleteForever color="error" />
                </ListItemIcon>
                <ListItemText
                  primary="Your bookings history will be removed"
                  secondary="All past and future bookings will be cancelled"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <DeleteForever color="error" />
                </ListItemIcon>
                <ListItemText
                  primary="Your reviews and ratings will be anonymized"
                  secondary="Reviews will remain but no longer be associated with your account"
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <DeleteForever color="error" />
                </ListItemIcon>
                <ListItemText
                  primary="Your messages will be deleted"
                  secondary="All conversation history will be permanently removed"
                />
              </ListItem>
            </List>

            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>
                Please acknowledge the following:
              </Typography>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={acknowledgements.dataLoss}
                    onChange={(e) =>
                      setAcknowledgements({ ...acknowledgements, dataLoss: e.target.checked })
                    }
                  />
                }
                label="I understand that all my data will be permanently deleted"
              />

              <FormControlLabel
                control={
                  <Checkbox
                    checked={acknowledgements.noRecovery}
                    onChange={(e) =>
                      setAcknowledgements({ ...acknowledgements, noRecovery: e.target.checked })
                    }
                  />
                }
                label="I understand this action cannot be easily undone"
              />

              <FormControlLabel
                control={
                  <Checkbox
                    checked={acknowledgements.activeBookings}
                    onChange={(e) =>
                      setAcknowledgements({
                        ...acknowledgements,
                        activeBookings: e.target.checked,
                      })
                    }
                  />
                }
                label="I understand that any active bookings will be cancelled"
              />
            </Box>

            <Alert severity="info" sx={{ mt: 3 }}>
              <Typography variant="body2">
                <strong>30-Day Grace Period:</strong> Your account will be deactivated immediately,
                but you have 30 days to contact support if you change your mind before permanent
                deletion.
              </Typography>
            </Alert>
          </Box>
        )}

        {confirmStep === 2 && (
          <Box>
            <Alert severity="error" sx={{ mb: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                Final Confirmation Required
              </Typography>
            </Alert>

            <Typography variant="body1" sx={{ mb: 2 }}>
              To confirm account deletion, please type{' '}
              <strong style={{ color: '#d32f2f' }}>DELETE MY ACCOUNT</strong> in the box below:
            </Typography>

            <TextField
              fullWidth
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type: DELETE MY ACCOUNT"
              autoFocus
              error={confirmText !== '' && !canConfirmDeletion()}
              helperText={
                confirmText !== '' && !canConfirmDeletion()
                  ? 'Please type exactly: DELETE MY ACCOUNT'
                  : ''
              }
              sx={{ mb: 2 }}
            />

            {canConfirmDeletion() && (
              <Alert severity="success" icon={<CheckCircle />}>
                <Typography variant="body2">
                  Confirmation text verified. You may proceed with account deletion.
                </Typography>
              </Alert>
            )}

            <Alert severity="warning" sx={{ mt: 2 }}>
              <Typography variant="body2">
                This is your last chance to cancel. Once you click "Delete My Account", your account
                will be deactivated immediately.
              </Typography>
            </Alert>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={deleteAccountMutation.isPending}>
          Cancel
        </Button>

        {confirmStep === 1 && (
          <Button
            variant="contained"
            color="warning"
            onClick={() => setConfirmStep(2)}
            disabled={!canProceedToStep2()}
          >
            Continue to Confirmation
          </Button>
        )}

        {confirmStep === 2 && (
          <>
            <Button onClick={() => setConfirmStep(1)}>Back</Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleDeleteAccount}
              disabled={!canConfirmDeletion() || deleteAccountMutation.isPending}
              startIcon={<DeleteForever />}
            >
              {deleteAccountMutation.isPending ? 'Deleting...' : 'Delete My Account'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default AccountDeletionDialog;
