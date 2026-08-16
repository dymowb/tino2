import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Typography, Box, Switch, FormControlLabel,
  Divider, Alert, CircularProgress,
} from '@mui/material';
import {
  Lock, Visibility, Download, Memory, Delete,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { apiService, User } from '../../services/api';

interface PrivacySettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const PrivacySettingsDialog: React.FC<PrivacySettingsDialogProps> = ({ open, onClose }) => {
  const { t } = useTranslation(['profile', 'common']);
  const navigate = useNavigate();
  const [profilePublic, setProfilePublic] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  // Keep the full settings blob so saving privacy doesn't wipe notification prefs
  // (PUT /auth/profile replaces the whole `settings` jsonb column).
  const [settings, setSettings] = useState<User['settings']>();

  // Load the user's actual stored visibility when the dialog opens. `loading`
  // gates the toggle so it doesn't flash the default before the real value lands.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    apiService.getProfile().then(p => {
      if (cancelled) return;
      setSettings(p.settings);
      setProfilePublic(p.settings?.privacy?.showProfile ?? true);
    }).catch(() => { /* keep defaults */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const merged: User['settings'] = {
        notifications: settings?.notifications ?? { email: true, sms: true, push: true },
        privacy: { showLocation: settings?.privacy?.showLocation ?? true, showProfile: profilePublic },
      };
      await apiService.updateProfile({ settings: merged });
      toast.success(t('profile:messages.update_success'));
      onClose();
    } catch {
      toast.error(t('profile:messages.update_error'));
    } finally {
      setSaving(false);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      // The server assembles this. Building it here from `getProfile()` is what
      // made "download my data" hand back a copy of the name and email already
      // on screen, with bookings, quotes, payments, reviews, messages and
      // assistant memory all absent.
      const blob = await apiService.exportMyData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tino2-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('profile:privacy.export_success'));
    } catch {
      toast.error(t('profile:privacy.export_error'));
    } finally {
      setExporting(false);
    }
  };

  const handleGoToMemory = () => {
    onClose();
    navigate('/memory');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Lock fontSize="small" />
        {t('profile:settings.privacy_settings')}
      </DialogTitle>

      <DialogContent dividers>
        {/* Profile Visibility */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Visibility fontSize="small" color="action" />
            <Typography variant="subtitle2" fontWeight={600}>
              {t('profile:privacy.visibility_title')}
            </Typography>
          </Box>
          <FormControlLabel
            control={
              loading
                ? <CircularProgress size={20} sx={{ mx: 1.25, my: 0.75 }} />
                : <Switch
                    checked={profilePublic}
                    onChange={e => setProfilePublic(e.target.checked)}
                    color="primary"
                  />
            }
            label={
              <Box>
                <Typography variant="body2">
                  {profilePublic ? t('profile:privacy.visibility_public') : t('profile:privacy.visibility_private')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('profile:privacy.visibility_desc')}
                </Typography>
              </Box>
            }
          />
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Data Export */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Download fontSize="small" color="action" />
            <Typography variant="subtitle2" fontWeight={600}>
              {t('profile:privacy.export_title')}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('profile:privacy.export_desc')}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={exporting ? <CircularProgress size={14} /> : <Download />}
            onClick={handleExportData}
            disabled={exporting}
          >
            {t('profile:privacy.export_button')}
          </Button>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Memory Opt-out */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Memory fontSize="small" color="action" />
            <Typography variant="subtitle2" fontWeight={600}>
              {t('profile:privacy.memory_title')}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('profile:privacy.memory_desc')}
          </Typography>
          <Button variant="outlined" size="small" onClick={handleGoToMemory}>
            {t('profile:privacy.memory_manage')}
          </Button>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Account Deletion Info */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Delete fontSize="small" color="error" />
            <Typography variant="subtitle2" fontWeight={600} color="error.main">
              {t('profile:privacy.delete_title')}
            </Typography>
          </Box>
          <Alert severity="warning" sx={{ mb: 1 }}>
            {t('profile:privacy.delete_desc')}
          </Alert>
          <Typography variant="caption" color="text.secondary">
            {t('profile:privacy.delete_contact')}
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={saving}>{t('common:close')}</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || loading}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {t('common:save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PrivacySettingsDialog;
