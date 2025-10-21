import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Button,
  Rating,
  Slider,
  Switch,
  FormControlLabel,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Divider,
  Paper,
  Avatar,
  Stack,
  Badge
} from '@mui/material';
import Grid from '@mui/material/Unstable_Grid2';
import {
  LocationOn,
  Phone,
  Email,
  Star,
  Verified,
  Security,
  Schedule,
  MyLocation,
  Search,
  FilterList,
  Route,
  Timer
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { apiService, Provider } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import BookingDialog from '../bookings/BookingDialog';
import QuoteRequestDialog from '../quotes/QuoteRequestDialog';

interface ExtendedProvider extends Provider {
  distance?: number;
  duration?: number;
}

const FindProvidersPage: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const { t } = useTranslation(['providers']);
  const [searchParams, setSearchParams] = useState({
    latitude: 40.7128,
    longitude: -74.0060,
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
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [showBookingDialog, setShowBookingDialog] = useState(false);
  const [showQuoteDialog, setShowQuoteDialog] = useState(false);
  const [selectedServiceForQuote, setSelectedServiceForQuote] = useState('');

  const serviceTypes = [
    'house_cleaning',
    'plumbing', 
    'electrical',
    'carpentry',
    'painting',
    'gardening',
    'hvac',
    'appliance_repair',
    'pest_control',
    'security_systems',
    'home_inspection',
    'roofing'
  ];

  // Get user's current location
  const getCurrentLocation = useCallback(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lng: longitude });
          setSearchParams(prev => ({
            ...prev,
            latitude,
            longitude
          }));
          toast.success(t('providers:messages.location_updated'));
        },
        (error) => {
          console.error('Error getting location:', error);
          toast.error(t('providers:messages.location_error'));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    } else {
      toast.error(t('providers:messages.geolocation_unsupported'));
    }
  }, [t]);

  // Geocode address search
  const handleAddressSearch = async () => {
    if (!addressSearch.trim()) {
      toast.error(t('providers:messages.enter_address'));
      return;
    }

    try {
      const result = await apiService.geocodeAddress(addressSearch);
      if (result && result.latitude && result.longitude) {
        setSearchParams(prev => ({
          ...prev,
          latitude: result.latitude,
          longitude: result.longitude
        }));
        toast.success(t('providers:messages.location_set', { address: result.formatted_address || addressSearch }));
      }
    } catch (error) {
      toast.error(t('providers:messages.location_failed'));
    }
  };

  // Search providers with location services
  const { 
    data: providersData, 
    isLoading, 
    error, 
    refetch 
  } = useQuery({
    queryKey: ['providers-gps', searchParams],
    queryFn: () => apiService.searchProvidersGPS(searchParams),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Ensure providers is always an array
  const providers: ExtendedProvider[] = React.useMemo(() => {
    return (providersData?.data?.providers && Array.isArray(providersData.data.providers)) ? providersData.data.providers : [];
  }, [providersData]);
  const pagination = providersData?.data;

  const handleServiceTypeChange = (serviceType: string, checked: boolean) => {
    setSearchParams(prev => ({
      ...prev,
      serviceTypes: checked 
        ? [...prev.serviceTypes, serviceType]
        : prev.serviceTypes.filter(s => s !== serviceType)
    }));
  };

  const handleQuoteRequest = (provider: ExtendedProvider) => {
    if (!isAuthenticated) {
      toast.error(t('providers:messages.login_required_quote'));
      return;
    }
    if (user?.userType !== 'customer') {
      toast.error(t('providers:messages.customers_only_quote'));
      return;
    }
    setSelectedServiceForQuote(provider.services?.[0] || '');
    setShowQuoteDialog(true);
  };

  const handleBookNow = (provider: ExtendedProvider) => {
    if (!isAuthenticated) {
      toast.error(t('providers:messages.login_required_booking'));
      return;
    }
    if (user?.userType !== 'customer') {
      toast.error(t('providers:messages.customers_only_booking'));
      return;
    }
    setSelectedProvider(provider);
    setShowBookingDialog(true);
  };

  const formatDistance = (distance: number) => {
    return distance < 1000 
      ? `${Math.round(distance)}m` 
      : `${(distance / 1000).toFixed(1)}km`;
  };

  const formatDuration = (duration: number) => {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <Box sx={{ p: 3, maxWidth: '1400px', mx: 'auto' }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>
        {t('providers:search.title')}
      </Typography>

      {/* Location and Search Controls */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          {t('providers:search.search_location')}
        </Typography>

        <Grid container spacing={2} alignItems="center">
          <Grid xs={12} md={6}>
            <TextField
              fullWidth
              label={t('providers:search.search_by_address')}
              value={addressSearch}
              onChange={(e) => setAddressSearch(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddressSearch()}
              InputProps={{
                endAdornment: (
                  <IconButton onClick={handleAddressSearch}>
                    <Search />
                  </IconButton>
                )
              }}
            />
          </Grid>

          <Grid xs={12} md={3}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<MyLocation />}
              onClick={getCurrentLocation}
              sx={{ height: '56px' }}
            >
              {t('providers:search.use_my_location')}
            </Button>
          </Grid>

          <Grid xs={12} md={3}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<FilterList />}
              onClick={() => setShowFilters(!showFilters)}
              sx={{ height: '56px' }}
            >
              {showFilters ? t('providers:search.hide_filters') : t('providers:search.show_filters')}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Advanced Filters */}
      {showFilters && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            {t('providers:search.filters')}
          </Typography>

          <Grid container spacing={3}>
            {/* Service Types */}
            <Grid xs={12} md={6}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                {t('providers:search.service_types')}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {serviceTypes.map(type => (
                  <Chip
                    key={type}
                    label={t(`providers:services.${type}`, type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))}
                    onClick={() => handleServiceTypeChange(type, !searchParams.serviceTypes.includes(type))}
                    color={searchParams.serviceTypes.includes(type) ? 'primary' : 'default'}
                    variant={searchParams.serviceTypes.includes(type) ? 'filled' : 'outlined'}
                  />
                ))}
              </Box>
            </Grid>

            {/* Sort and Radius */}
            <Grid xs={12} md={6}>
              <Stack spacing={2}>
                <FormControl>
                  <InputLabel>{t('providers:search.sort_by')}</InputLabel>
                  <Select
                    value={searchParams.sortBy}
                    label={t('providers:search.sort_by')}
                    onChange={(e) => setSearchParams(prev => ({ ...prev, sortBy: e.target.value as any }))}
                  >
                    <MenuItem value="distance">{t('providers:search.distance')}</MenuItem>
                    <MenuItem value="rating">{t('providers:search.rating_option')}</MenuItem>
                    <MenuItem value="price">{t('providers:search.price_option')}</MenuItem>
                    <MenuItem value="response_time">{t('providers:search.response_time_option')}</MenuItem>
                  </Select>
                </FormControl>

                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    {t('providers:search.search_radius_km', { radius: searchParams.radius })}
                  </Typography>
                  <Slider
                    value={searchParams.radius}
                    onChange={(_, value) => setSearchParams(prev => ({ ...prev, radius: value as number }))}
                    min={1}
                    max={100}
                    marks={[
                      { value: 5, label: '5km' },
                      { value: 25, label: '25km' },
                      { value: 50, label: '50km' },
                      { value: 100, label: '100km' }
                    ]}
                    valueLabelDisplay="auto"
                  />
                </Box>
              </Stack>
            </Grid>

            {/* Filters Row */}
            <Grid xs={12}>
              <Stack direction="row" spacing={2} flexWrap="wrap">
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    {t('providers:search.minimum_rating_value', { rating: searchParams.minRating })}
                  </Typography>
                  <Slider
                    value={searchParams.minRating}
                    onChange={(_, value) => setSearchParams(prev => ({ ...prev, minRating: value as number }))}
                    min={0}
                    max={5}
                    step={0.5}
                    marks={[
                      { value: 0, label: 'Any' },
                      { value: 3, label: '3⭐' },
                      { value: 4, label: '4⭐' },
                      { value: 5, label: '5⭐' }
                    ]}
                    sx={{ width: 200 }}
                    valueLabelDisplay="auto"
                  />
                </Box>

                <FormControlLabel
                  control={
                    <Switch
                      checked={searchParams.hasInsurance}
                      onChange={(e) => setSearchParams(prev => ({ ...prev, hasInsurance: e.target.checked }))}
                    />
                  }
                  label={t('providers:search.insurance')}
                />

                <FormControlLabel
                  control={
                    <Switch
                      checked={searchParams.hasBackgroundCheck}
                      onChange={(e) => setSearchParams(prev => ({ ...prev, hasBackgroundCheck: e.target.checked }))}
                    />
                  }
                  label={t('providers:search.background_check')}
                />

                <FormControlLabel
                  control={
                    <Switch
                      checked={searchParams.isAvailable}
                      onChange={(e) => setSearchParams(prev => ({ ...prev, isAvailable: e.target.checked }))}
                    />
                  }
                  label={t('providers:search.available_now_label')}
                />
              </Stack>
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* Results */}
      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {t('providers:search.error_loading')}
        </Alert>
      )}

      {!isLoading && !error && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6">
              {t(
                (pagination?.totalCount || 0) === 1
                  ? 'providers:search.providers_found'
                  : 'providers:search.providers_found_plural',
                { count: pagination?.totalCount || 0 }
              )}
            </Typography>

            <Button onClick={() => refetch()} variant="outlined" startIcon={<Search />}>
              {t('providers:search.refresh')}
            </Button>
          </Box>

          {providers.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary">
                {t('providers:search.no_providers_description')}
              </Typography>
            </Paper>
          ) : (
            <Grid container spacing={3}>
              {providers.map((provider: ExtendedProvider) => (
                <Grid xs={12} md={6} lg={4} key={provider.id}>
                  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <CardContent sx={{ flexGrow: 1 }}>
                      {/* Header with distance */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1 }}>
                            {provider.businessName}
                          </Typography>
                          
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                            <Rating value={provider.rating} readOnly size="small" />
                            <Typography variant="body2" sx={{ ml: 1 }}>
                              {provider.rating} ({provider.totalReviews} {t('providers:card.reviews')})
                            </Typography>
                          </Box>
                        </Box>

                        {provider.distance && (
                          <Box sx={{ textAlign: 'right' }}>
                            <Chip 
                              icon={<Route />} 
                              label={formatDistance(provider.distance)}
                              size="small" 
                              color="primary" 
                              variant="outlined"
                            />
                            {provider.duration && (
                              <Chip 
                                icon={<Timer />} 
                                label={formatDuration(provider.duration)}
                                size="small" 
                                sx={{ ml: 1 }}
                                variant="outlined"
                              />
                            )}
                          </Box>
                        )}
                      </Box>

                      {/* Description */}
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 40 }}>
                        {provider.description}
                      </Typography>

                      {/* Services */}
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                          {t('providers:card.services_label')}
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {provider.services?.slice(0, 3).map((service, index) => (
                            <Chip
                              key={index}
                              label={t(`providers:services.${service}`, service.replace(/_/g, ' '))}
                              size="small"
                              variant="outlined"
                            />
                          ))}
                          {provider.services && provider.services.length > 3 && (
                            <Chip
                              label={t('providers:card.more_services', { count: provider.services.length - 3 })}
                              size="small"
                              variant="outlined"
                            />
                          )}
                        </Box>
                      </Box>

                      {/* Badges */}
                      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                        {provider.isInsured && (
                          <Tooltip title={t('providers:card.insured')}>
                            <Chip
                              icon={<Security />}
                              label={t('providers:card.insured')}
                              size="small"
                              color="success"
                              variant="outlined"
                            />
                          </Tooltip>
                        )}
                        {provider.isBackgroundChecked && (
                          <Tooltip title={t('providers:card.verified')}>
                            <Chip
                              icon={<Verified />}
                              label={t('providers:card.verified')}
                              size="small"
                              color="info"
                              variant="outlined"
                            />
                          </Tooltip>
                        )}
                      </Box>

                      {/* Pricing */}
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="h6" color="primary.main">
                          ${provider.pricing?.baseRate || 50}
                          <Typography component="span" variant="body2" color="text.secondary">
                            /{t(`providers:card.${provider.pricing?.rateType || 'hour'}`, provider.pricing?.rateType || 'hour')}
                          </Typography>
                        </Typography>
                      </Box>

                      {/* Stats */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          {provider.completedJobs} {t('providers:card.completed_jobs_label')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {t('providers:card.responds_in_hours', { time: provider.averageResponseTime })}
                        </Typography>
                      </Box>
                    </CardContent>

                    <Divider />

                    {/* Actions */}
                    <Box sx={{ p: 2 }}>
                      <Stack direction="row" spacing={1}>
                        <Button
                          fullWidth
                          variant="outlined"
                          onClick={() => handleQuoteRequest(provider)}
                        >
                          {t('providers:card.request_quote')}
                        </Button>
                        <Button
                          fullWidth
                          variant="contained"
                          onClick={() => handleBookNow(provider)}
                        >
                          {t('providers:card.book_now')}
                        </Button>
                      </Stack>
                    </Box>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}

          {/* Pagination could be added here if needed */}
        </>
      )}

      {/* Booking Dialog */}
      <BookingDialog
        open={showBookingDialog}
        onClose={() => {
          setShowBookingDialog(false);
          setSelectedProvider(null);
        }}
        provider={selectedProvider}
        serviceType={searchParams.serviceTypes[0] || ''}
      />

      {/* Quote Request Dialog */}
      <QuoteRequestDialog
        open={showQuoteDialog}
        onClose={() => {
          setShowQuoteDialog(false);
          setSelectedServiceForQuote('');
        }}
        serviceType={selectedServiceForQuote}
      />
    </Box>
  );
};

export default FindProvidersPage;