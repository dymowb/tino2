import React, { useState } from 'react';
import { Box, Paper, Typography, TextField, Button, CircularProgress, Alert } from '@mui/material';
import { Link } from 'react-router-dom';
import apiService from '../../services/api';

const ForgotPasswordPage: React.FC = () => {
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
        <Typography variant="h5" fontWeight={700} mb={1}>Reset your password</Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          Enter your email and we'll send you a reset link.
        </Typography>

        {submitted ? (
          <Alert severity="success">
            If that email is registered, a reset link has been sent. Check your inbox.
          </Alert>
        ) : (
          <Box component="form" onSubmit={handleSubmit}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <TextField
              fullWidth
              label="Email Address"
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
              {loading ? <CircularProgress size={22} /> : 'Send Reset Link'}
            </Button>
          </Box>
        )}

        <Typography variant="body2" sx={{ mt: 2, textAlign: 'center' }}>
          <Link to="/login" style={{ color: 'inherit' }}>Back to login</Link>
        </Typography>
      </Paper>
    </Box>
  );
};

export default ForgotPasswordPage;
