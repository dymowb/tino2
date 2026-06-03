import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Tabs, Tab, Box, Typography, TextField, FormControl,
  InputLabel, Select, MenuItem, Chip, Button, Slider,
  Switch, FormControlLabel, CircularProgress, Alert,
  IconButton, Tooltip, Paper, Stack, Autocomplete,
} from '@mui/material';
import Grid from '@mui/material/Unstable_Grid2';
import {
  Verified, Security, MyLocation, Search,
  FilterList, Route, Timer, ArrowForward,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { apiService, Provider } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import BookingDialog from '../bookings/BookingDialog';
import QuoteRequestDialog from '../quotes/QuoteRequestDialog';
import AIAssistantTab from '../assistant/AIAssistantTab';
import { tokens } from '../../theme/theme';

interface ExtendedProvider extends Provider {
  distance?: number;
  distanceText?: string;
  duration?: number;
  durationText?: string;
}

// ── Helpers ──────────────────────────────────────────────

const ACCENT_COLORS = [
  tokens.color.earth,
  tokens.color.terra,
  '#2A7BB5',
  '#5A8A3F',
  tokens.color.stone,
  '#7B5EA7',
];

function getProviderAccent(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return ACCENT_COLORS[Math.abs(hash) % ACCENT_COLORS.length];
}

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
}

function formatDistance(distance: number): string {
  return distance < 1000 ? `${Math.round(distance)}m` : `${(distance / 1000).toFixed(1)}km`;
}

function formatDuration(duration: number): string {
  const h = Math.floor(duration / 3600);
  const m = Math.floor((duration % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── StarRating ────────────────────────────────────────────

const StarRating: React.FC<{ value: number; count: number }> = ({ value, count }) => {
  const filled = Math.round(Number(value));
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Box
          key={n}
          component="span"
          sx={{ color: n <= filled ? tokens.color.gold : 'divider', fontSize: '0.9rem', lineHeight: 1 }}
        >
          ★
        </Box>
      ))}
      <Typography sx={{
        fontFamily: tokens.font.mono,
        fontSize: '0.75rem',
        color: 'text.secondary',
        ml: 0.75,
      }}>
        {Number(value).toFixed(1)} · {count}
      </Typography>
    </Box>
  );
};

// ── ProviderCard ──────────────────────────────────────────

interface ProviderCardProps {
  provider: ExtendedProvider;
  onBook: () => void;
  onQuote: () => void;
}

const ProviderCard: React.FC<ProviderCardProps> = ({ provider, onBook, onQuote }) => {
  const { t } = useTranslation(['providers']);
  const accent = getProviderAccent(provider.businessName);
  const initials = getInitials(provider.businessName);
  const price = provider.pricing?.baseRate || 50;
  const rateType = provider.pricing?.rateType || 'hour';

  return (
    <Box sx={{
      borderRadius: tokens.radius.lg,
      border: '1px solid',
      borderColor: 'divider',
      bgcolor: 'background.paper',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: `0 16px 40px ${accent}1A`,
        borderColor: accent,
      },
    }}>
      {/* 4:3 Header block */}
      <Box sx={{ position: 'relative', paddingTop: '62%', bgcolor: accent, overflow: 'hidden' }}>
        {/* Geometric background shapes */}
        <Box sx={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(135deg, ${accent} 0%, ${accent}CC 100%)`,
        }} />
        <Box sx={{
          position: 'absolute',
          width: '60%', height: '160%',
          borderRadius: '50%',
          bgcolor: 'rgba(255,255,255,0.06)',
          right: '-15%', top: '-30%',
        }} />
        <Box sx={{
          position: 'absolute',
          width: '40%', height: '100%',
          borderRadius: '50%',
          bgcolor: 'rgba(0,0,0,0.08)',
          left: '-5%', bottom: '-20%',
        }} />

        {/* Initials */}
        <Typography sx={{
          position: 'absolute',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          fontFamily: tokens.font.display,
          fontSize: { xs: '2.5rem', md: '3rem' },
          fontWeight: 600,
          color: 'rgba(255,255,255,0.92)',
          letterSpacing: '-0.02em',
          lineHeight: 1,
          zIndex: 1,
        }}>
          {initials}
        </Typography>

        {/* Price pill — bottom right */}
        <Box sx={{
          position: 'absolute',
          bottom: 12, right: 12,
          zIndex: 2,
          bgcolor: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(8px)',
          borderRadius: tokens.radius.full,
          px: 1.5, py: 0.5,
          display: 'flex', alignItems: 'baseline', gap: 0.25,
        }}>
          <Typography sx={{
            fontFamily: tokens.font.mono,
            fontSize: '1rem',
            fontWeight: 500,
            color: '#fff',
          }}>
            R${price}
          </Typography>
          <Typography sx={{ fontFamily: tokens.font.mono, fontSize: '0.7rem', color: 'rgba(255,255,255,0.65)' }}>
            /{t(`providers:card.${rateType}`, rateType)}
          </Typography>
        </Box>

        {/* Trust badges — bottom left */}
        <Box sx={{
          position: 'absolute',
          bottom: 12, left: 12,
          zIndex: 2,
          display: 'flex', gap: 0.75,
        }}>
          {provider.isBackgroundChecked && (
            <Tooltip title={t('providers:card.verified')}>
              <Box sx={{
                bgcolor: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(8px)',
                borderRadius: tokens.radius.full,
                px: 1, py: 0.4,
                display: 'flex', alignItems: 'center', gap: 0.4,
              }}>
                <Verified sx={{ fontSize: '0.75rem', color: '#62D4FF' }} />
                <Typography sx={{ fontSize: '0.68rem', color: '#fff', fontWeight: 600 }}>
                  {t('providers:card.verified')}
                </Typography>
              </Box>
            </Tooltip>
          )}
          {provider.isInsured && (
            <Tooltip title={t('providers:card.insured')}>
              <Box sx={{
                bgcolor: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(8px)',
                borderRadius: tokens.radius.full,
                px: 1, py: 0.4,
                display: 'flex', alignItems: 'center', gap: 0.4,
              }}>
                <Security sx={{ fontSize: '0.75rem', color: '#7BCC6C' }} />
                <Typography sx={{ fontSize: '0.68rem', color: '#fff', fontWeight: 600 }}>
                  {t('providers:card.insured')}
                </Typography>
              </Box>
            </Tooltip>
          )}
        </Box>

        {/* Distance badge — top right */}
        {(provider.distanceText || provider.distance) && (
          <Box sx={{
            position: 'absolute',
            top: 12, right: 12,
            zIndex: 2,
            bgcolor: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)',
            borderRadius: tokens.radius.full,
            px: 1, py: 0.4,
            display: 'flex', alignItems: 'center', gap: 0.4,
          }}>
            <Route sx={{ fontSize: '0.75rem', color: '#fff' }} />
            <Typography sx={{ fontSize: '0.68rem', color: '#fff', fontWeight: 600 }}>
              {provider.distanceText || formatDistance(provider.distance!)}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Card body */}
      <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5, flex: 1 }}>
        {/* Name + rating */}
        <Box>
          <Typography variant="h5" sx={{
            fontFamily: tokens.font.display,
            fontWeight: 500,
            color: 'text.primary',
            mb: 0.5,
            lineHeight: 1.2,
          }}>
            {provider.businessName}
          </Typography>
          <StarRating value={Number(provider.rating)} count={provider.totalReviews} />
        </Box>

        {/* Description */}
        <Typography variant="body2" sx={{
          color: 'text.secondary',
          lineHeight: 1.6,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {provider.description}
        </Typography>

        {/* Services */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 'auto' }}>
          {provider.services?.slice(0, 3).map((svc, i) => (
            <Chip
              key={i}
              label={t(`providers:services.${svc}`, svc.replace(/_/g, ' '))}
              size="small"
              sx={{
                borderRadius: tokens.radius.sm,
                fontSize: '0.7rem',
                height: 24,
                bgcolor: `${accent}14`,
                color: accent,
                border: `1px solid ${accent}30`,
              }}
            />
          ))}
          {provider.services && provider.services.length > 3 && (
            <Chip
              label={`+${provider.services.length - 3}`}
              size="small"
              sx={{ borderRadius: tokens.radius.sm, fontSize: '0.7rem', height: 24 }}
            />
          )}
        </Box>

        {/* Stats row */}
        <Box sx={{ display: 'flex', gap: 2, pt: 0.5 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {Math.floor(Number(provider.completedJobs))} {t('providers:card.completed_jobs_label')}
          </Typography>
          {(provider.durationText || provider.duration) && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              <Timer sx={{ fontSize: '0.75rem', color: 'text.secondary' }} />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {provider.durationText || formatDuration(provider.duration!)}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* Actions */}
      <Box sx={{
        borderTop: '1px solid',
        borderColor: 'divider',
        p: 2,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 1,
      }}>
        <Button variant="outlined" color="primary" size="small" onClick={onQuote}
          sx={{ borderRadius: tokens.radius.full, fontSize: '0.8rem' }}>
          {t('providers:card.request_quote')}
        </Button>
        <Button variant="contained" color="secondary" size="small" endIcon={<ArrowForward sx={{ fontSize: '0.9rem' }} />}
          onClick={onBook} sx={{ borderRadius: tokens.radius.full, fontSize: '0.8rem' }}>
          {t('providers:card.book_now')}
        </Button>
      </Box>
    </Box>
  );
};

// ── Page ─────────────────────────────────────────────────

const FindProvidersPage: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const { t } = useTranslation(['providers']);

  const [searchParams, setSearchParams] = useState({
    latitude: -27.5954, longitude: -48.5480,
    radius: 25,
    serviceTypes: [] as string[],
    sortBy: 'distance' as 'distance' | 'rating' | 'price' | 'response_time',
    minRating: 0,
    maxPrice: 200,
    hasInsurance: false,
    hasBackgroundCheck: false,
    isAvailable: false,
  });

  const [addressSearch, setAddressSearch] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [showQuoteDialog, setShowQuoteDialog] = useState(false);
  const [selectedServiceForQuote, setSelectedServiceForQuote] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [aiCompleted, setAiCompleted] = useState(false);

  const { data: serviceCatalog = [] } = useQuery({
    queryKey: ['service-catalog'],
    queryFn: () => apiService.getServiceCatalog(),
    staleTime: 10 * 60 * 1000,
  });

  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) { toast.error(t('providers:messages.geolocation_unsupported')); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude } }) => {
        setSearchParams(p => ({ ...p, latitude, longitude }));
        toast.success(t('providers:messages.location_updated'));
      },
      () => toast.error(t('providers:messages.location_error')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  }, [t]);

  const handleAddressSearch = async () => {
    if (!addressSearch.trim()) { toast.error(t('providers:messages.enter_address')); return; }
    try {
      const result = await apiService.geocodeAddress(addressSearch);
      if (result?.location?.latitude && result?.location?.longitude) {
        setSearchParams(p => ({ ...p, latitude: result.location.latitude, longitude: result.location.longitude }));
        toast.success(t('providers:messages.location_set', { address: result.formattedAddress || addressSearch }));
      }
    } catch { toast.error(t('providers:messages.location_failed')); }
  };

  const { data: providersData, isLoading, error, refetch } = useQuery({
    queryKey: ['providers-gps', searchParams],
    queryFn: () => apiService.searchProvidersGPS(searchParams),
    staleTime: 5 * 60 * 1000,
  });

  const providers: ExtendedProvider[] = React.useMemo(() => {
    const raw = providersData?.data?.providers;
    return Array.isArray(raw) ? raw : [];
  }, [providersData]);

  const totalCount = providersData?.data?.totalCount || 0;

  const handleBookNow = (provider: ExtendedProvider) => {
    if (!isAuthenticated) { toast.error(t('providers:messages.login_required_booking')); return; }
    if (user?.userType !== 'customer') { toast.error(t('providers:messages.customers_only_booking')); return; }
    setSelectedProvider(provider);
    setShowBookingDialog(true);
  };

  const handleQuoteRequest = (provider: ExtendedProvider) => {
    if (!isAuthenticated) { toast.error(t('providers:messages.login_required_quote')); return; }
    if (user?.userType !== 'customer') { toast.error(t('providers:messages.customers_only_quote')); return; }
    setSelectedServiceForQuote(provider.services?.[0] || '');
    setShowQuoteDialog(true);
  };

  return (
    <Box sx={{ maxWidth: '1400px', mx: 'auto', px: { xs: 2, md: 4 }, py: 4 }}>

      {/* Page header */}
      <Box sx={{ mb: 4 }}>
        <Typography sx={{
          fontFamily: tokens.font.body,
          fontSize: '0.72rem',
          fontWeight: 700,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: tokens.color.terra,
          mb: 1,
        }}>
          {t('providers:search.title')}
        </Typography>
        <Typography variant="h3" sx={{ fontFamily: tokens.font.display, fontWeight: 500 }}>
          {t('providers:search.title')}
        </Typography>
      </Box>

      {!aiCompleted && (
        <Tabs
          value={activeTab}
          onChange={(_e, v) => setActiveTab(v)}
          sx={{ mb: 4, borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Tab label={t('assistant:tabs.aiAssistant')} />
          <Tab label={t('assistant:tabs.browseFilter')} />
        </Tabs>
      )}

      {activeTab === 0 && <AIAssistantTab onComplete={() => setAiCompleted(true)} onReset={() => setAiCompleted(false)} />}

      {activeTab === 1 && (
        <>
          {/* Search + location bar */}
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr auto auto' },
            gap: 2,
            mb: 3,
          }}>
            <TextField
              fullWidth
              size="small"
              label={t('providers:search.search_by_address')}
              value={addressSearch}
              onChange={e => setAddressSearch(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleAddressSearch()}
              InputProps={{
                endAdornment: (
                  <IconButton size="small" onClick={handleAddressSearch}>
                    <Search fontSize="small" />
                  </IconButton>
                ),
              }}
            />
            <Button
              variant="outlined"
              startIcon={<MyLocation />}
              onClick={getCurrentLocation}
              sx={{ whiteSpace: 'nowrap', height: 40 }}
            >
              {t('providers:search.use_my_location')}
            </Button>
            <Button
              variant={showFilters ? 'contained' : 'outlined'}
              color={showFilters ? 'primary' : 'inherit'}
              startIcon={<FilterList />}
              onClick={() => setShowFilters(!showFilters)}
              sx={{ whiteSpace: 'nowrap', height: 40 }}
            >
              {t('providers:search.filters')}
            </Button>
          </Box>

          {/* Filters panel */}
          {showFilters && (
            <Paper sx={{ p: 3, mb: 4 }} variant="outlined">
              <Grid container spacing={3}>
                <Grid xs={12} md={6}>
                  <Autocomplete
                    multiple
                    options={serviceCatalog}
                    value={searchParams.serviceTypes}
                    onChange={(_, v) => setSearchParams(p => ({ ...p, serviceTypes: v }))}
                    renderInput={params => (
                      <TextField {...params} size="small" label={t('providers:search.service_types')}
                        placeholder={searchParams.serviceTypes.length === 0 ? t('providers:search.service_type_placeholder') : ''} />
                    )}
                    renderTags={(value, getTagProps) =>
                      value.map((opt, i) => <Chip label={opt} size="small" {...getTagProps({ index: i })} key={opt} />)
                    }
                  />
                </Grid>

                <Grid xs={12} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>{t('providers:search.sort_by')}</InputLabel>
                    <Select
                      value={searchParams.sortBy}
                      label={t('providers:search.sort_by')}
                      onChange={e => setSearchParams(p => ({ ...p, sortBy: e.target.value as typeof p.sortBy }))}
                    >
                      <MenuItem value="distance">{t('providers:search.distance')}</MenuItem>
                      <MenuItem value="rating">{t('providers:search.rating_option')}</MenuItem>
                      <MenuItem value="price">{t('providers:search.price_option')}</MenuItem>
                      <MenuItem value="response_time">{t('providers:search.response_time_option')}</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid xs={12} md={3}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                    {t('providers:search.search_radius_km', { radius: searchParams.radius })}
                  </Typography>
                  <Slider
                    value={searchParams.radius}
                    onChange={(_, v) => setSearchParams(p => ({ ...p, radius: v as number }))}
                    min={1} max={100}
                    marks={[{ value: 5, label: '5km' }, { value: 25, label: '25km' }, { value: 100, label: '100km' }]}
                    valueLabelDisplay="auto"
                    size="small"
                  />
                </Grid>

                <Grid xs={12}>
                  <Stack direction="row" spacing={3} flexWrap="wrap" alignItems="center">
                    <Box sx={{ minWidth: 200 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                        {t('providers:search.minimum_rating_value', { rating: searchParams.minRating })}
                      </Typography>
                      <Slider
                        value={searchParams.minRating}
                        onChange={(_, v) => setSearchParams(p => ({ ...p, minRating: v as number }))}
                        min={0} max={5} step={0.5} valueLabelDisplay="auto" size="small"
                        marks={[{ value: 0, label: t('common:home.all_rating') }, { value: 4, label: '4★' }, { value: 5, label: '5★' }]}
                      />
                    </Box>
                    <FormControlLabel
                      control={<Switch size="small" checked={searchParams.hasInsurance} onChange={e => setSearchParams(p => ({ ...p, hasInsurance: e.target.checked }))} />}
                      label={<Typography variant="body2">{t('providers:search.insurance')}</Typography>}
                    />
                    <FormControlLabel
                      control={<Switch size="small" checked={searchParams.hasBackgroundCheck} onChange={e => setSearchParams(p => ({ ...p, hasBackgroundCheck: e.target.checked }))} />}
                      label={<Typography variant="body2">{t('providers:search.background_check')}</Typography>}
                    />
                    <FormControlLabel
                      control={<Switch size="small" checked={searchParams.isAvailable} onChange={e => setSearchParams(p => ({ ...p, isAvailable: e.target.checked }))} />}
                      label={<Typography variant="body2">{t('providers:search.available_now_label')}</Typography>}
                    />
                  </Stack>
                </Grid>
              </Grid>
            </Paper>
          )}

          {/* Results */}
          {isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          )}

          {error && <Alert severity="error" sx={{ mb: 3 }}>{t('providers:search.error_loading')}</Alert>}

          {!isLoading && !error && (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                  {t(
                    totalCount === 1 ? 'providers:search.providers_found' : 'providers:search.providers_found_plural',
                    { count: totalCount },
                  )}
                </Typography>
                <Button size="small" variant="outlined" onClick={() => refetch()} startIcon={<Search />}>
                  {t('providers:search.refresh')}
                </Button>
              </Box>

              {providers.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 10 }}>
                  <Typography variant="h5" sx={{ fontFamily: tokens.font.display, color: 'text.secondary', mb: 1 }}>
                    Nenhum prestador encontrado
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {t('providers:search.no_providers_description')}
                  </Typography>
                </Box>
              ) : (
                <Box sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
                  gap: 3,
                }}>
                  {providers.map(provider => (
                    <ProviderCard
                      key={provider.id}
                      provider={provider}
                      onBook={() => handleBookNow(provider)}
                      onQuote={() => handleQuoteRequest(provider)}
                    />
                  ))}
                </Box>
              )}
            </>
          )}
        </>
      )}

      <BookingDialog
        open={showBookingDialog}
        onClose={() => { setShowBookingDialog(false); setSelectedProvider(null); }}
        provider={selectedProvider}
        serviceType={searchParams.serviceTypes[0] || ''}
      />
      <QuoteRequestDialog
        open={showQuoteDialog}
        onClose={() => { setShowQuoteDialog(false); setSelectedServiceForQuote(''); }}
        serviceType={selectedServiceForQuote}
      />
    </Box>
  );
};

export default FindProvidersPage;
