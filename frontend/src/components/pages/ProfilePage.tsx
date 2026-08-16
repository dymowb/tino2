import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  Box, Container, Typography, TextField, Button, Stack, Avatar, Chip,
  Autocomplete, CircularProgress, Alert, InputAdornment, Rating, useTheme, alpha,
} from '@mui/material';
import {
  Edit, Save, Close, Lock, Notifications, Shield, DeleteOutline,
  Person, Star, WorkOutline,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { apiService, User, Provider } from '../../services/api';
import { tokens } from '../../theme/theme';
import PasswordChangeDialog from '../profile/PasswordChangeDialog';
import AccountDeletionDialog from '../profile/AccountDeletionDialog';
import PrivacySettingsDialog from '../profile/PrivacySettingsDialog';
import { currencySymbol, formatMoney } from '../../utils/money';

const ProfilePage: React.FC = () => {
  const { t, i18n } = useTranslation(['profile', 'common']);
  const { user } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const queryClient = useQueryClient();

  const isProvider = user?.userType === 'provider';

  const [editing, setEditing] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [deletionDialogOpen, setDeletionDialogOpen] = useState(false);
  const [privacyDialogOpen, setPrivacyDialogOpen] = useState(false);

  const [form, setForm] = useState({
    firstName: '', lastName: '', phone: '',
    businessName: '', description: '', services: [] as string[],
    hourlyRate: 0, serviceRadius: 25,
  });

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: profile, isLoading: profileLoading, error: profileError } =
    useQuery<User>({ queryKey: ['profile'], queryFn: () => apiService.getProfile() });

  const { data: providerData, isLoading: providerLoading } = useQuery({
    queryKey: ['my-provider'],
    queryFn: () => apiService.getMyProviderProfile(),
    enabled: isProvider,
  });
  const provider: Provider | undefined = providerData?.data?.provider;

  const { data: serviceCatalog = [] } = useQuery({
    queryKey: ['service-catalog'],
    queryFn: () => apiService.getServiceCatalog(),
    enabled: isProvider,
  });

  // Seed the editable form whenever fresh data arrives (and on entering edit mode).
  useEffect(() => {
    setForm(f => ({
      ...f,
      firstName: profile?.firstName || '',
      lastName: profile?.lastName || '',
      phone: profile?.phone || '',
      businessName: provider?.businessName || '',
      description: provider?.description || '',
      services: provider?.services || [],
      hourlyRate: Number(provider?.pricing?.baseRate) || 0,
      serviceRadius: Number(provider?.serviceRadius) || 25,
    }));
  }, [profile, provider]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiService.updateProfile({
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
      });
      if (isProvider && provider) {
        await apiService.updateProviderProfile(provider.id, {
          businessName: form.businessName,
          description: form.description,
          services: form.services,
          serviceRadius: form.serviceRadius,
          pricing: {
            baseRate: form.hourlyRate,
            currency: provider.pricing?.currency || 'BRL',
            rateType: provider.pricing?.rateType || 'hourly',
          },
        });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      await queryClient.invalidateQueries({ queryKey: ['my-provider'] });
      setEditing(false);
      toast.success(t('profile:messages.update_success'));
    },
    onError: () => toast.error(t('profile:messages.update_error')),
  });

  const onField = (field: keyof typeof form, value: any) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const formatDate = (s?: string) =>
    s ? new Date(s).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'pt-BR',
      { year: 'numeric', month: 'long', day: 'numeric' }) : t('profile:fields.not_provided');

  const currency = (n: number) => formatMoney(n);

  const cardSx = {
    borderRadius: tokens.radius.lg,
    border: `1px solid ${isDark ? tokens.color.nightBorder : tokens.color.paperDark}`,
    bgcolor: isDark ? tokens.color.nightCard : tokens.color.paper,
    p: { xs: 2.5, md: 3.5 },
  } as const;

  const sectionTitleSx = {
    fontFamily: tokens.font.display, fontWeight: 600, fontSize: '1.15rem', mb: 0.5,
  } as const;

  const isLoading = profileLoading || (isProvider && providerLoading);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (profileError) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="error">{t('profile:messages.update_error')}</Alert>
      </Container>
    );
  }

  // ── Field renderer (label + value or input) ─────────────────────────────────
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <Box>
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '0.68rem' }}>
        {label}
      </Typography>
      <Box sx={{ mt: 0.75 }}>{children}</Box>
    </Box>
  );

  const readValue = (v?: React.ReactNode) => (
    <Typography variant="body1" sx={{ color: v ? 'text.primary' : 'text.disabled' }}>
      {v || t('profile:fields.not_provided')}
    </Typography>
  );

  const gridSx = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 3 };

  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 } }}>
      {/* Header — stacks on mobile so PT button labels never overflow */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'center' }}
        sx={{ mb: 4 }}
      >
        <Typography sx={{ fontFamily: tokens.font.display, fontWeight: 600, fontSize: { xs: '1.6rem', md: '2rem' } }}>
          {t('profile:title')}
        </Typography>
        {!editing ? (
          <Button
            variant="contained" startIcon={<Edit />} onClick={() => setEditing(true)}
            sx={{ borderRadius: tokens.radius.full, alignSelf: { xs: 'stretch', sm: 'auto' } }}
          >
            {t('profile:edit_profile')}
          </Button>
        ) : (
          <Stack direction="row" spacing={1.5} sx={{ width: { xs: '100%', sm: 'auto' } }}>
            <Button
              variant="contained" startIcon={saveMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <Save />}
              onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
              sx={{ borderRadius: tokens.radius.full, flex: { xs: 1, sm: 'none' } }}
            >
              {saveMutation.isPending ? t('profile:saving') : t('profile:save_changes')}
            </Button>
            <Button
              variant="outlined" startIcon={<Close />} disabled={saveMutation.isPending}
              onClick={() => { setEditing(false); }}
              sx={{ borderRadius: tokens.radius.full, flex: { xs: 1, sm: 'none' } }}
            >
              {t('profile:cancel')}
            </Button>
          </Stack>
        )}
      </Stack>

      <Stack spacing={3}>
        {/* Basic information */}
        <Box sx={cardSx}>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
            <Avatar
              src={profile?.profileImage}
              sx={{ width: 56, height: 56, bgcolor: alpha(tokens.color.earth, 0.15), color: tokens.color.earth, fontFamily: tokens.font.display, fontWeight: 600 }}
            >
              {(profile?.firstName?.[0] || '') + (profile?.lastName?.[0] || '') || <Person />}
            </Avatar>
            <Box>
              <Typography sx={sectionTitleSx}>{t('profile:sections.basic_information')}</Typography>
              <Chip
                size="small"
                label={t(`common:user_type.${profile?.userType}`, profile?.userType || '')}
                // terra on a 12% terra tint is about 3.8:1 — under AA for label-sized
                // text. The darker shade of the same hue clears it without changing
                // the look; in dark mode the tint is the dark surface, so the light
                // shade is the one that reads.
                sx={{
                  textTransform: 'capitalize',
                  bgcolor: alpha(tokens.color.terra, 0.12),
                  color: isDark ? tokens.color.terraLight : tokens.color.terraDark,
                  fontWeight: 600,
                }}
              />
            </Box>
          </Stack>

          <Box sx={gridSx}>
            <Field label={t('profile:fields.first_name')}>
              {editing
                ? <TextField fullWidth size="small" value={form.firstName} onChange={e => onField('firstName', e.target.value)} />
                : readValue(profile?.firstName)}
            </Field>
            <Field label={t('profile:fields.last_name')}>
              {editing
                ? <TextField fullWidth size="small" value={form.lastName} onChange={e => onField('lastName', e.target.value)} />
                : readValue(profile?.lastName)}
            </Field>
            <Field label={t('profile:fields.email')}>{readValue(profile?.email)}</Field>
            <Field label={t('profile:fields.phone')}>
              {editing
                ? <TextField fullWidth size="small" type="tel" value={form.phone} onChange={e => onField('phone', e.target.value)} />
                : readValue(profile?.phone)}
            </Field>
            <Field label={t('profile:fields.member_since')}>{readValue(formatDate(profile?.createdAt))}</Field>
          </Box>
        </Box>

        {/* Provider information */}
        {isProvider && provider && (
          <Box sx={cardSx}>
            <Typography sx={{ ...sectionTitleSx, mb: 3 }}>{t('profile:sections.provider_information')}</Typography>

            {/* Read-only stats */}
            <Stack direction="row" spacing={3} sx={{ mb: 3, flexWrap: 'wrap', gap: 2 }}>
              <Stack direction="row" spacing={0.75} alignItems="center">
                <Star sx={{ fontSize: 18, color: tokens.color.gold }} />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {(Number(provider.rating) || 0).toFixed(1)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ({provider.totalReviews} {t('profile:fields.reviews')})
                </Typography>
              </Stack>
              <Stack direction="row" spacing={0.75} alignItems="center">
                <WorkOutline sx={{ fontSize: 18, color: tokens.color.earth }} />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{Math.round(Number(provider.completedJobs)) || 0}</Typography>
                <Typography variant="body2" color="text.secondary">{t('profile:fields.completed_jobs')}</Typography>
              </Stack>
            </Stack>

            <Box sx={gridSx}>
              <Field label={t('profile:fields.business_name')}>
                {editing
                  ? <TextField fullWidth size="small" value={form.businessName} onChange={e => onField('businessName', e.target.value)} />
                  : readValue(provider.businessName)}
              </Field>
              <Field label={t('profile:fields.hourly_rate')}>
                {editing
                  ? <TextField fullWidth size="small" type="number" value={form.hourlyRate}
                      onChange={e => onField('hourlyRate', parseFloat(e.target.value) || 0)}
                      InputProps={{ startAdornment: <InputAdornment position="start">{currencySymbol()}</InputAdornment> }} />
                  : readValue(`${currency(Number(provider.pricing?.baseRate))}/h`)}
              </Field>
              <Field label={t('profile:fields.service_radius')}>
                {editing
                  ? <TextField fullWidth size="small" type="number" value={form.serviceRadius}
                      onChange={e => onField('serviceRadius', parseFloat(e.target.value) || 0)}
                      InputProps={{ endAdornment: <InputAdornment position="end">km</InputAdornment> }} />
                  : readValue(`${Number(provider.serviceRadius) || 0} km`)}
              </Field>
            </Box>

            <Box sx={{ mt: 3 }}>
              <Field label={t('profile:fields.description')}>
                {editing
                  ? <TextField fullWidth size="small" multiline minRows={3} value={form.description} onChange={e => onField('description', e.target.value)} />
                  : readValue(provider.description || t('profile:fields.no_description'))}
              </Field>
            </Box>

            <Box sx={{ mt: 3 }}>
              <Field label={t('profile:fields.services_offered')}>
                {editing ? (
                  <Autocomplete
                    multiple options={serviceCatalog} value={form.services}
                    onChange={(_, v) => onField('services', v)}
                    renderTags={(value, getTagProps) =>
                      value.map((opt, i) => <Chip label={opt} size="small" {...getTagProps({ index: i })} key={opt} />)}
                    renderInput={params => <TextField {...params} size="small" placeholder={t('profile:fields.services_offered')} />}
                  />
                ) : (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {(provider.services || []).length
                      ? provider.services.map(s => (
                          <Chip key={s} label={s} size="small"
                            sx={{ bgcolor: alpha(tokens.color.earth, 0.12), color: isDark ? tokens.color.paper : tokens.color.earth }} />
                        ))
                      : readValue(undefined)}
                  </Box>
                )}
              </Field>
            </Box>
          </Box>
        )}

        {/* Account actions */}
        <Box sx={cardSx}>
          <Typography sx={{ ...sectionTitleSx, mb: 2.5 }}>{t('profile:sections.account_actions')}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}>
            {[
              { icon: <Lock />, label: t('profile:password.change_password'), onClick: () => setPasswordDialogOpen(true) },
              { icon: <Notifications />, label: t('profile:settings.notification_settings'), onClick: () => navigate('/notifications?tab=settings') },
              { icon: <Shield />, label: t('profile:settings.privacy_settings'), onClick: () => setPrivacyDialogOpen(true) },
              { icon: <DeleteOutline />, label: t('profile:delete_account.button'), onClick: () => setDeletionDialogOpen(true), color: 'error' as const },
            ].map(a => (
              <Button
                key={a.label}
                variant="outlined" color={a.color || 'primary'} startIcon={a.icon} onClick={a.onClick}
                fullWidth
                sx={{ borderRadius: tokens.radius.lg, justifyContent: 'flex-start', px: 2, py: 1.25, textTransform: 'none', fontWeight: 600 }}
              >
                {a.label}
              </Button>
            ))}
          </Box>
        </Box>
      </Stack>

      <PasswordChangeDialog open={passwordDialogOpen} onClose={() => setPasswordDialogOpen(false)} />
      <PrivacySettingsDialog open={privacyDialogOpen} onClose={() => setPrivacyDialogOpen(false)} />
      <AccountDeletionDialog open={deletionDialogOpen} onClose={() => setDeletionDialogOpen(false)} />
    </Container>
  );
};

export default ProfilePage;
