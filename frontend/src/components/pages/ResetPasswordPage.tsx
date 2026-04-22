import React, { useState } from 'react';
import { Box, Paper, Typography, TextField, Button, CircularProgress, Alert, InputAdornment, IconButton } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import apiService from '../../services/api';

const ResetPasswordPage: React.FC = () => {
  const { t } = useTranslation('auth');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!token) {
    return (
      <Box sx={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
        <Paper sx={{ p: 4, maxWidth: 420, width: '100%' }}>
          <Alert severity="error">{t('reset_password.invalid_token')}</Alert>
          <Typography variant="body2" sx={{ mt: 2, textAlign: 'center' }}>
            <Link to="/forgot-password" style={{ color: 'inherit' }}>{t('forgot_password.title')}</Link>
          </Typography>
        </Paper>
      </Box>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError(t('register.passwords_dont_match'));
      return;
    }
    if (password.length < 8) {
      setError(t('register.password_min_length'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await apiService.resetPassword(token, password);
      toast.success(t('reset_password.success'));
      navigate('/login');
    } catch (err: any) {
      setError(err?.response?.data?.error || t('reset_password.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Paper sx={{ p: 4, maxWidth: 420, width: '100%' }}>
        <Typography variant="h5" fontWeight={700} mb={1}>{t('reset_password.title')}</Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          {t('forgot_password.description')}
        </Typography>

        <Box component="form" onSubmit={handleSubmit}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <TextField
            fullWidth
            label={t('reset_password.password')}
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
            sx={{ mb: 2 }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowPassword(p => !p)} edge="end">
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <TextField
            fullWidth
            label={t('reset_password.confirm_password')}
            type={showPassword ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            sx={{ mb: 3 }}
            error={confirm.length > 0 && password !== confirm}
            helperText={confirm.length > 0 && password !== confirm ? t('register.passwords_dont_match') : ''}
          />

          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={loading || !password || !confirm}
          >
            {loading ? <CircularProgress size={22} /> : t('reset_password.submit')}
          </Button>
        </Box>

        <Typography variant="body2" sx={{ mt: 2, textAlign: 'center' }}>
          <Link to="/login" style={{ color: 'inherit' }}>{t('forgot_password.back_to_login')}</Link>
        </Typography>
      </Paper>
    </Box>
  );
};

export default ResetPasswordPage;
