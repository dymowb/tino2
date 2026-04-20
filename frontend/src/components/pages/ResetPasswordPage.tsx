import React, { useState } from 'react';
import { Box, Paper, Typography, TextField, Button, CircularProgress, Alert, InputAdornment, IconButton } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import apiService from '../../services/api';

const ResetPasswordPage: React.FC = () => {
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
          <Alert severity="error">Invalid reset link. Please request a new one.</Alert>
          <Typography variant="body2" sx={{ mt: 2, textAlign: 'center' }}>
            <Link to="/forgot-password" style={{ color: 'inherit' }}>Request new link</Link>
          </Typography>
        </Paper>
      </Box>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await apiService.resetPassword(token, password);
      toast.success('Password reset successfully!');
      navigate('/login');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Paper sx={{ p: 4, maxWidth: 420, width: '100%' }}>
        <Typography variant="h5" fontWeight={700} mb={1}>Set new password</Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          Choose a strong password for your account.
        </Typography>

        <Box component="form" onSubmit={handleSubmit}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <TextField
            fullWidth
            label="New Password"
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
            label="Confirm Password"
            type={showPassword ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            sx={{ mb: 3 }}
            error={confirm.length > 0 && password !== confirm}
            helperText={confirm.length > 0 && password !== confirm ? 'Passwords do not match' : ''}
          />

          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={loading || !password || !confirm}
          >
            {loading ? <CircularProgress size={22} /> : 'Reset Password'}
          </Button>
        </Box>

        <Typography variant="body2" sx={{ mt: 2, textAlign: 'center' }}>
          <Link to="/login" style={{ color: 'inherit' }}>Back to login</Link>
        </Typography>
      </Paper>
    </Box>
  );
};

export default ResetPasswordPage;
