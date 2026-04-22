import React, { useState } from 'react';
import { Box, Paper, Typography, TextField, Button, CircularProgress, Alert } from '@mui/material';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import apiService from '../../services/api';

const ForgotPasswordPage: React.FC = () => {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    try {
      await apiService.forgotPassword(email.trim());
      setSubmitted(true);
    } catch {
      // Always show success to avoid email enumeration
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Paper sx={{ p: 4, maxWidth: 420, width: '100%' }}>
        <Typography variant="h5" fontWeight={700} mb={1}>{t('forgot_password.title')}</Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          {t('forgot_password.description')}
        </Typography>

        {submitted ? (
          <Alert severity="success">
            {t('forgot_password.success')}
          </Alert>
        ) : (
          <Box component="form" onSubmit={handleSubmit}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <TextField
              fullWidth
              label={t('forgot_password.email')}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              sx={{ mb: 2 }}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={loading || !email.trim()}
            >
              {loading ? <CircularProgress size={22} /> : t('forgot_password.submit')}
            </Button>
          </Box>
        )}

        <Typography variant="body2" sx={{ mt: 2, textAlign: 'center' }}>
          <Link to="/login" style={{ color: 'inherit' }}>{t('forgot_password.back_to_login')}</Link>
        </Typography>
      </Paper>
    </Box>
  );
};

export default ForgotPasswordPage;
