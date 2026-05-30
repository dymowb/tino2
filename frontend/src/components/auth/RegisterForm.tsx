import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Container,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  CircularProgress,
  Chip,
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import { motion } from 'framer-motion';
import { tokens } from '../../theme/theme';

const RegisterForm: React.FC = () => {
  const { register } = useAuth();
  const { t } = useTranslation(['auth']);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    userType: 'customer' as 'customer' | 'provider',
    phone: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registeredEmail, setRegisteredEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError(t('auth:register.passwords_dont_match'));
      setLoading(false);
      return;
    }

    // Enhanced password validation to match backend requirements
    if (formData.password.length < 8) {
      setError(t('auth:register.password_min_length'));
      setLoading(false);
      return;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
    if (!passwordRegex.test(formData.password)) {
      setError(t('auth:register.password_requirements'));
      setLoading(false);
      return;
    }

    try {
      const result = await register({
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        userType: formData.userType,
        phone: formData.phone || undefined,
      });
      setRegisteredEmail(result.email);
    } catch (error: any) {
      // Enhanced error handling for better user experience
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || t('auth:register.error');

      // Handle validation errors specifically
      if (error.response?.data?.errors?.password) {
        setError(error.response.data.errors.password[0]);
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSelectChange = (e: any) => {
    setFormData({
      ...formData,
      userType: e.target.value,
    });
  };

  if (registeredEmail) {
    return (
      <Box sx={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
        <Box sx={{ maxWidth: 440, width: '100%', p: 4, borderRadius: tokens.radius.xl, border: `1px solid ${tokens.color.paperDark}`, bgcolor: tokens.color.paper, textAlign: 'center' }}>
          <Typography sx={{ fontFamily: tokens.font.display, fontSize: '1.75rem', fontWeight: 500, color: tokens.color.earth, mb: 1.5 }}>
            {t('auth:register.check_email_title')}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('auth:register.verification_sent_to', { email: registeredEmail })}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {t('auth:register.activate_instructions')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('auth:register.already_verified')}{' '}
            <Link to="/login" style={{ color: tokens.color.earth, textDecoration: 'none', fontWeight: 600 }}>
              {t('auth:register.login_here')}
            </Link>
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 4, mb: 4 }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <Box sx={{
          p: { xs: 3, sm: 4 },
          borderRadius: tokens.radius.xl,
          border: `1px solid ${tokens.color.paperDark}`,
          bgcolor: tokens.color.paper,
        }}>
          <Box sx={{ mb: 3.5 }}>
            <Typography sx={{ fontFamily: tokens.font.display, fontSize: '1.875rem', fontWeight: 500, mb: 0.5 }}>
              {t('auth:register.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('auth:register.subtitle')}
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <FormControl fullWidth margin="normal" sx={{ mb: 2 }}>
              <InputLabel>{t('auth:register.user_type')}</InputLabel>
              <Select
                name="userType"
                value={formData.userType}
                label={t('auth:register.user_type')}
                onChange={handleSelectChange}
              >
                <MenuItem value="customer">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    👤 <span>{t('auth:register.customer_desc')}</span>
                  </Box>
                </MenuItem>
                <MenuItem value="provider">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    🔧 <span>{t('auth:register.provider_desc')}</span>
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                fullWidth
                label={t('auth:register.first_name')}
                name="firstName"
                value={formData.firstName}
                onChange={handleChange}
                required
                margin="normal"
              />
              <TextField
                fullWidth
                label={t('auth:register.last_name')}
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                required
                margin="normal"
              />
            </Box>

            <TextField
              fullWidth
              label={t('auth:register.email')}
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
              label={t('auth:register.phone')}
              name="phone"
              type="tel"
              value={formData.phone}
              onChange={handleChange}
              margin="normal"
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label={t('auth:register.password')}
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              margin="normal"
              required
              helperText={t('auth:register.password_helper')}
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label={t('auth:register.confirm_password')}
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleChange}
              margin="normal"
              required
              sx={{ mb: 3 }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{
                py: 1.5, mb: 3,
                bgcolor: tokens.color.terra,
                '&:hover': { bgcolor: tokens.color.terraDark },
                borderRadius: tokens.radius.full,
                fontSize: '0.9375rem',
                textTransform: 'none',
              }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : t('auth:register.submit')}
            </Button>

            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {t('auth:register.already_have_account')}{' '}
                <Link to="/login" style={{ color: tokens.color.earth, textDecoration: 'none', fontWeight: 600 }}>
                  {t('auth:register.login_link')}
                </Link>
              </Typography>
            </Box>
          </Box>
        </Box>
      </motion.div>
    </Container>
  );
};

export default RegisterForm;