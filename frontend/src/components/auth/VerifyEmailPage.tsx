import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Container, Paper, Typography, CircularProgress, Box } from '@mui/material';
import { apiService } from '../../services/api';

type Status = 'loading' | 'success' | 'error';

const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setMessage('No verification token found in the URL.');
      return;
    }

    apiService.verifyEmail(token)
      .then(() => {
        setStatus('success');
        setMessage('Your email has been verified. You can now log in.');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.response?.data?.error || 'Verification failed. The link may have expired.');
      });
  }, [searchParams]);

  return (
    <Container maxWidth="sm" sx={{ mt: 10 }}>
      <Paper elevation={4} sx={{ p: 4, borderRadius: 3, textAlign: 'center' }}>
        {status === 'loading' && (
          <Box>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography>Verifying your email...</Typography>
          </Box>
        )}

        {status === 'success' && (
          <Box>
            <Typography variant="h5" sx={{ color: '#4CAF50', mb: 2 }}>
              Email verified!
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              {message}
            </Typography>
            <Link to="/login" style={{ color: '#1976d2', fontWeight: 600 }}>
              Go to login
            </Link>
          </Box>
        )}

        {status === 'error' && (
          <Box>
            <Typography variant="h5" sx={{ color: '#d32f2f', mb: 2 }}>
              Verification failed
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              {message}
            </Typography>
            <Link to="/login" style={{ color: '#1976d2', fontWeight: 600 }}>
              Back to login
            </Link>
          </Box>
        )}
      </Paper>
    </Container>
  );
};

export default VerifyEmailPage;
