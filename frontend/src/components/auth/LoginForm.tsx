import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  Chip,
  Divider,
  CircularProgress,
} from '@mui/material';
import { apiService } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { motion } from 'framer-motion';

const LoginForm: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t } = useTranslation(['auth']);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const loggedUser = await login(formData.email, formData.password);
      if (loggedUser?.userType === 'provider') {
        navigate('/dashboard');
      } else {
        navigate('/');
      }
    } catch (error: any) {
      const data = error.response?.data;
      if (data?.error === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(data.email || formData.email);
        setError('');
      } else {
        setError(data?.error || error.message || t('auth:login.error'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleResend = async () => {
    setResendStatus('sending');
    try {
      await apiService.resendVerification(unverifiedEmail);
      setResendStatus('sent');
    } catch {
      setResendStatus('idle');
    }
  };

  const fillDemoAccount = (type: 'customer' | 'provider') => {
    if (type === 'customer') {
      setFormData({
        email: 'customer@demo.com',
        password: 'Demo123!',
      });
    } else {
      setFormData({
        email: 'provider@demo.com',
        password: 'Demo123!',
      });
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8, mb: 4 }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Paper
          elevation={4}
          sx={{
            p: 4,
            borderRadius: 3,
            background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
          }}
        >
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Typography
              variant="h4"
              component="h1"
              gutterBottom
              sx={{
                fontWeight: 'bold',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {t('auth:login.title')}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {t('auth:login.subtitle')}
            </Typography>
          </Box>

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            </motion.div>
          )}

          {unverifiedEmail && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>
                {t('auth:login.email_not_verified', { email: unverifiedEmail })}
              </Typography>
              {resendStatus === 'sent' ? (
                <Typography variant="body2">{t('auth:login.verification_sent')}</Typography>
              ) : (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleResend}
                  disabled={resendStatus === 'sending'}
                  sx={{ mt: 0.5 }}
                >
                  {resendStatus === 'sending' ? t('auth:login.sending') : t('auth:login.resend_verification')}
                </Button>
              )}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label={t('auth:login.email')}
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              margin="normal"
              required
              autoComplete="email"
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label={t('auth:login.password')}
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              margin="normal"
              required
              autoComplete="current-password"
              sx={{ mb: 3 }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{
                py: 1.5,
                mb: 3,
                background: 'linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)',
                fontSize: '1.1rem',
                textTransform: 'none',
                '&:hover': {
                  background: 'linear-gradient(135deg, #45A049 0%, #1B5E20 100%)',
                },
              }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : t('auth:login.submit')}
            </Button>

            <Divider sx={{ my: 3 }}>
              <Chip label={t('auth:login.demo_accounts')} size="small" />
            </Divider>

            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
              <Button
                variant="outlined"
                fullWidth
                onClick={() => fillDemoAccount('customer')}
                sx={{ textTransform: 'none' }}
              >
                {t('auth:login.customer_demo')}
              </Button>
              <Button
                variant="outlined"
                fullWidth
                onClick={() => fillDemoAccount('provider')}
                sx={{ textTransform: 'none' }}
              >
                {t('auth:login.provider_demo')}
              </Button>
            </Box>

            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                <Link to="/forgot-password" style={{ color: '#1976d2', textDecoration: 'none' }}>
                  {t('auth:login.forgot_password')}
                </Link>
              </Typography>
            </Box>

            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {t('auth:login.no_account')}{' '}
                <Link
                  to="/register"
                  style={{
                    color: '#1976d2',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  {t('auth:login.register_link')}
                </Link>
              </Typography>
            </Box>
          </Box>
        </Paper>
      </motion.div>
    </Container>
  );
};

export default LoginForm;