import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, 
  Typography, 
  Card, 
  CardContent, 
  Grid, 
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

interface ExtendedProvider extends Provider {
  distance?: number;
  duration?: number;
}

const FindProvidersPage: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
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
  const [showFilters, setShowFilters] = useState(false);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [showBookingDialog, setShowBookingDialog] = useState(false);

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
          toast.success('Location updated!');
        },
        (error) => {
          console.error('Error getting location:', error);
          toast.error('Failed to get your location');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    } else {
      toast.error('Geolocation is not supported by this browser');
    }
  }, []);

  // Geocode address search
  const handleAddressSearch = async () => {
    if (!addressSearch.trim()) {
      toast.error('Please enter an address');
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
        toast.success(`Location set to ${result.formatted_address || addressSearch}`);
      }
    } catch (error) {
      toast.error('Failed to find location');
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

  const providers = providersData?.data || [];
  const pagination = providersData?.pagination;

  const handleServiceTypeChange = (serviceType: string, checked: boolean) => {
    setSearchParams(prev => ({
      ...prev,
      serviceTypes: checked 
        ? [...prev.serviceTypes, serviceType]
        : prev.serviceTypes.filter(s => s !== serviceType)
    }));
  };

  const handleQuoteRequest = async (providerId: string) => {
    toast.info('Quote system - Coming in Task 3!');
  };

  const handleBookNow = (provider: ExtendedProvider) => {
    if (!isAuthenticated) {
      toast.error('Please log in to book services');
      return;
    }
    if (user?.userType !== 'customer') {
      toast.error('Only customers can book services');
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
        Find Service Providers
      </Typography>

      {/* Location and Search Controls */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Search Location
        </Typography>
        
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Search by address"
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
          
          <Grid item xs={12} md={3}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<MyLocation />}
              onClick={getCurrentLocation}
              sx={{ height: '56px' }}
            >
              Use My Location
            </Button>
          </Grid>
          
          <Grid item xs={12} md={3}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<FilterList />}
              onClick={() => setShowFilters(!showFilters)}
              sx={{ height: '56px' }}
            >
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Advanced Filters */}
      {showFilters && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Filters
          </Typography>
          
          <Grid container spacing={3}>
            {/* Service Types */}
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                Service Types
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {serviceTypes.map(type => (
                  <Chip
                    key={type}
                    label={type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    onClick={() => handleServiceTypeChange(type, !searchParams.serviceTypes.includes(type))}
                    color={searchParams.serviceTypes.includes(type) ? 'primary' : 'default'}
                    variant={searchParams.serviceTypes.includes(type) ? 'filled' : 'outlined'}
                  />
                ))}
              </Box>
            </Grid>

            {/* Sort and Radius */}
            <Grid item xs={12} md={6}>
              <Stack spacing={2}>
                <FormControl>
                  <InputLabel>Sort By</InputLabel>
                  <Select
                    value={searchParams.sortBy}
                    label="Sort By"
                    onChange={(e) => setSearchParams(prev => ({ ...prev, sortBy: e.target.value as any }))}
                  >
                    <MenuItem value="distance">Distance</MenuItem>
                    <MenuItem value="rating">Rating</MenuItem>
                    <MenuItem value="price">Price</MenuItem>
                    <MenuItem value="response_time">Response Time</MenuItem>
                  </Select>
                </FormControl>

                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Search Radius: {searchParams.radius}km
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
            <Grid item xs={12}>
              <Stack direction="row" spacing={2} flexWrap="wrap">
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Minimum Rating: {searchParams.minRating}
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
                  label="Has Insurance"
                />
                
                <FormControlLabel
                  control={
                    <Switch 
                      checked={searchParams.hasBackgroundCheck}
                      onChange={(e) => setSearchParams(prev => ({ ...prev, hasBackgroundCheck: e.target.checked }))}
                    />
                  }
                  label="Background Check"
                />
                
                <FormControlLabel
                  control={
                    <Switch 
                      checked={searchParams.isAvailable}
                      onChange={(e) => setSearchParams(prev => ({ ...prev, isAvailable: e.target.checked }))}
                    />
                  }
                  label="Available Now"
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
          Failed to load providers. Please try again.
        </Alert>
      )}

      {!isLoading && !error && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6">
              {pagination?.total || 0} Provider{(pagination?.total || 0) !== 1 ? 's' : ''} Found
            </Typography>
            
            <Button onClick={() => refetch()} variant="outlined" startIcon={<Search />}>
              Refresh
            </Button>
          </Box>

          {providers.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary">
                No providers found matching your criteria. Try adjusting your filters or expanding your search radius.
              </Typography>
            </Paper>
          ) : (
            <Grid container spacing={3}>
              {providers.map((provider: ExtendedProvider) => (
                <Grid item xs={12} md={6} lg={4} key={provider.id}>
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
                              {provider.rating} ({provider.totalReviews} reviews)
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
                          Services:
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {provider.services?.slice(0, 3).map((service, index) => (
                            <Chip 
                              key={index}
                              label={service.replace(/_/g, ' ')}
                              size="small"
                              variant="outlined"
                            />
                          ))}
                          {provider.services && provider.services.length > 3 && (
                            <Chip 
                              label={`+${provider.services.length - 3} more`}
                              size="small"
                              variant="outlined"
                            />
                          )}
                        </Box>
                      </Box>

                      {/* Badges */}
                      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                        {provider.isInsured && (
                          <Tooltip title="Insured">
                            <Chip 
                              icon={<Security />} 
                              label="Insured" 
                              size="small" 
                              color="success" 
                              variant="outlined"
                            />
                          </Tooltip>
                        )}
                        {provider.isBackgroundChecked && (
                          <Tooltip title="Background Checked">
                            <Chip 
                              icon={<Verified />} 
                              label="Verified" 
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
                            /{provider.pricing?.rateType || 'hour'}
                          </Typography>
                        </Typography>
                      </Box>

                      {/* Stats */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          {provider.completedJobs} completed jobs
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Responds in {provider.averageResponseTime}h
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
                          onClick={() => handleQuoteRequest(provider.id)}
                        >
                          Request Quote
                        </Button>
                        <Button
                          fullWidth
                          variant="contained"
                          onClick={() => handleBookNow(provider)}
                        >
                          Book Now
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
    </Box>
  );
};

export default FindProvidersPage;