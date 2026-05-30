import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, CircularProgress, Button } from '@mui/material';
import { CheckCircle, ErrorOutline } from '@mui/icons-material';
import { apiService } from '../../services/api';
import { tokens } from '../../theme/theme';

type Status = 'loading' | 'success' | 'error';

const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setMessage('Nenhum token de verificação encontrado na URL.');
      return;
    }
    apiService.verifyEmail(token)
      .then(() => { setStatus('success'); })
      .catch((err) => {
        setStatus('error');
        setMessage(err.response?.data?.error || 'Verificação falhou. O link pode ter expirado.');
      });
  }, [searchParams]);

  return (
    <Box sx={{
      minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      px: 2,
    }}>
      <Box sx={{
        maxWidth: 420, width: '100%',
        p: 4, borderRadius: tokens.radius.xl,
        border: `1px solid ${tokens.color.paperDark}`,
        bgcolor: tokens.color.paper,
        textAlign: 'center',
      }}>
        {status === 'loading' && (
          <>
            <CircularProgress sx={{ color: tokens.color.earth, mb: 2 }} />
            <Typography color="text.secondary">Verificando seu e-mail…</Typography>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle sx={{ fontSize: 48, color: tokens.color.earth, mb: 2 }} />
            <Typography sx={{ fontFamily: tokens.font.display, fontSize: '1.5rem', fontWeight: 500, mb: 1 }}>
              E-mail verificado!
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              Sua conta está ativa. Você já pode fazer login.
            </Typography>
            <Button
              variant="contained"
              onClick={() => navigate('/login')}
              sx={{
                bgcolor: tokens.color.earth,
                '&:hover': { bgcolor: tokens.color.earthLight },
                borderRadius: tokens.radius.full, px: 4,
              }}
            >
              Ir para o Login
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <ErrorOutline sx={{ fontSize: 48, color: tokens.color.terra, mb: 2 }} />
            <Typography sx={{ fontFamily: tokens.font.display, fontSize: '1.5rem', fontWeight: 500, mb: 1 }}>
              Verificação falhou
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>{message}</Typography>
            <Button
              variant="outlined"
              onClick={() => navigate('/login')}
              sx={{ borderRadius: tokens.radius.full }}
            >
              Voltar ao Login
            </Button>
          </>
        )}
      </Box>
    </Box>
  );
};

export default VerifyEmailPage;
