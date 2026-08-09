import React, { useMemo, useState } from 'react';
import { AutoAwesome, ExpandMore } from '@mui/icons-material';
import { Box, Button, Chip, Collapse, Paper, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import apiService from '../../services/api';

const AiTransparencyFooter: React.FC = () => {
  const { t } = useTranslation('assistant');
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['app-config'],
    queryFn: () => apiService.getAppConfig(),
    staleTime: 60_000,
  });

  const models = useMemo(() => {
    if (!data?.ai) return [];
    const seen = new Set<string>();
    return Object.values(data.ai).flatMap(entry => entry.models).filter(target => {
      const key = `${target.provider}:${target.model}`;
      if (!target.model || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [data]);

  if (!models.length) return null;

  return (
    <Paper component="footer" variant="outlined" sx={{ mt: 4, mx: { xs: 2, md: 4 }, mb: 2, p: 1.5, borderRadius: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, flexWrap: 'wrap' }}>
        <AutoAwesome color="primary" sx={{ fontSize: 17 }} />
        <Typography variant="caption" color="text.secondary">{t('transparency.poweredBy')}</Typography>
        <Button
          size="small"
          color="inherit"
          endIcon={<ExpandMore sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
          onClick={() => setOpen(value => !value)}
          aria-expanded={open}
        >
          {t('transparency.details')}
        </Button>
      </Box>
      <Collapse in={open}>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent="center" sx={{ pt: 1.5 }}>
          {models.map(target => (
            <Chip
              key={`${target.provider}:${target.model}`}
              size="small"
              variant="outlined"
              label={`${target.provider} · ${target.model}`}
            />
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" textAlign="center" sx={{ mt: 1 }}>
          {t('transparency.disclaimer')}
        </Typography>
      </Collapse>
    </Paper>
  );
};

export default AiTransparencyFooter;
