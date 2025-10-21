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

const RegisterForm: React.FC = () => {
  const navigate = useNavigate();
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
      await register({
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        userType: formData.userType,
        phone: formData.phone || undefined,
      });
      navigate('/');
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

  return (
    <Container maxWidth="sm" sx={{ mt: 4, mb: 4 }}>
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
            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          }}
        >
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Typography
              variant="h4"
              component="h1"
              gutterBottom
              sx={{
                fontWeight: 'bold',
                color: 'white',
                textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
              }}
            >
              {t('auth:register.title')}
            </Typography>
            <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.9)' }}>
              {t('auth:register.subtitle')}
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

          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{
              bgcolor: 'rgba(255,255,255,0.95)',
              p: 3,
              borderRadius: 2,
            }}
          >
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
                py: 1.5,
                mb: 3,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                fontSize: '1.1rem',
                textTransform: 'none',
                '&:hover': {
                  background: 'linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%)',
                },
              }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : t('auth:register.submit')}
            </Button>

            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {t('auth:register.already_have_account')}{' '}
                <Link
                  to="/login"
                  style={{
                    color: '#1976d2',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  {t('auth:register.login_link')}
                </Link>
              </Typography>
            </Box>
          </Box>
        </Paper>
      </motion.div>
    </Container>
  );
};

export default RegisterForm;