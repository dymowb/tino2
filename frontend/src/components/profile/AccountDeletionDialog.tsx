import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('profile');
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [confirmStep, setConfirmStep] = useState(1);
  const [confirmText, setConfirmText] = useState('');
  const [acknowledgements, setAcknowledgements] = useState({
    dataLoss: false,
    noRecovery: false,
    activeBookings: false,
  });

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setConfirmStep(1);
      setConfirmText('');
      setAcknowledgements({
        dataLoss: false,
        noRecovery: false,
        activeBookings: false,
      });
    }
  }, [open]);

  const deleteAccountMutation = useMutation({
    mutationFn: () => apiService.deleteAccount(),
    onSuccess: () => {
      toast.success(t('delete_account.success'));
      handleClose();
      // Log out and redirect to home page
      logout();
      navigate('/');
    },
    onError: (error: any) => {
      const errorMessage = error?.response?.data?.error || t('delete_account.error');
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
    return confirmText.toUpperCase() === t('delete_account.delete_text').toUpperCase();
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
          <Typography variant="h6">{t('delete_account.title')}</Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        {confirmStep === 1 && (
          <Box>
            <Alert severity="error" sx={{ mb: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
                {t('delete_account.warning_permanent')}
              </Typography>
              <Typography variant="body2">
                {t('delete_account.deactivation_notice')}
              </Typography>
            </Alert>

            <Typography variant="h6" sx={{ mb: 2 }}>
              {t('delete_account.what_happens')}
            </Typography>

            <List>
              <ListItem>
                <ListItemIcon>
                  <DeleteForever color="error" />
                </ListItemIcon>
                <ListItemText
                  primary={t('delete_account.consequences.personal_data')}
                  secondary={t('delete_account.consequences.personal_data_detail')}
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <DeleteForever color="error" />
                </ListItemIcon>
                <ListItemText
                  primary={t('delete_account.consequences.bookings')}
                  secondary={t('delete_account.consequences.bookings_detail')}
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <DeleteForever color="error" />
                </ListItemIcon>
                <ListItemText
                  primary={t('delete_account.consequences.reviews')}
                  secondary={t('delete_account.consequences.reviews_detail')}
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <DeleteForever color="error" />
                </ListItemIcon>
                <ListItemText
                  primary={t('delete_account.consequences.messages')}
                  secondary={t('delete_account.consequences.messages_detail')}
                />
              </ListItem>
            </List>

            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>
                {t('delete_account.acknowledge_instruction')}
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
                label={t('delete_account.ack_data_loss')}
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
                label={t('delete_account.ack_no_recovery')}
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
                label={t('delete_account.ack_active_bookings')}
              />
            </Box>

            <Alert severity="info" sx={{ mt: 3 }}>
              <Typography variant="body2">
                <strong>{t('delete_account.grace_period_title')}</strong> {t('delete_account.grace_period_description')}
              </Typography>
            </Alert>
          </Box>
        )}

        {confirmStep === 2 && (
          <Box>
            <Alert severity="error" sx={{ mb: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                {t('delete_account.final_confirmation')}
              </Typography>
            </Alert>

            <Typography variant="body1" sx={{ mb: 2 }}>
              {t('delete_account.type_instruction')}{' '}
              <strong style={{ color: '#d32f2f' }}>{t('delete_account.delete_text')}</strong> {t('delete_account.type_instruction_full')}
            </Typography>

            <TextField
              fullWidth
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={t('delete_account.placeholder')}
              autoFocus
              error={confirmText !== '' && !canConfirmDeletion()}
              helperText={
                confirmText !== '' && !canConfirmDeletion()
                  ? t('delete_account.type_exactly')
                  : ''
              }
              sx={{ mb: 2 }}
            />

            {canConfirmDeletion() && (
              <Alert severity="success" icon={<CheckCircle />}>
                <Typography variant="body2">
                  {t('delete_account.confirmation_verified')}
                </Typography>
              </Alert>
            )}

            <Alert severity="warning" sx={{ mt: 2 }}>
              <Typography variant="body2">
                {t('delete_account.last_chance')}
              </Typography>
            </Alert>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={deleteAccountMutation.isPending}>
          {t('delete_account.cancel')}
        </Button>

        {confirmStep === 1 && (
          <Button
            variant="contained"
            color="warning"
            onClick={() => setConfirmStep(2)}
            disabled={!canProceedToStep2()}
          >
            {t('delete_account.continue')}
          </Button>
        )}

        {confirmStep === 2 && (
          <>
            <Button onClick={() => setConfirmStep(1)}>{t('delete_account.back')}</Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleDeleteAccount}
              disabled={!canConfirmDeletion() || deleteAccountMutation.isPending}
              startIcon={<DeleteForever />}
            >
              {deleteAccountMutation.isPending ? t('delete_account.deleting') : t('delete_account.submit')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default AccountDeletionDialog;
