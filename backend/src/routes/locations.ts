import { Router } from 'express';
import ProviderSearchService from '../services/ProviderSearchService';
import LocationController from '../controllers/LocationController';

const router = Router();

// --- Geocoding ---
router.post('/geocode', LocationController.geocodeAddress);
router.post('/reverse-geocode', LocationController.reverseGeocode);

// --- Distance ---
router.post('/distance', LocationController.calculateDistance);

// --- Provider search ---
// GET by lat/lng (existing, used by Find Providers page filters)
router.get('/providers/search', async (req, res) => {
  try {
    const latitude = parseFloat(req.query.latitude as string) || 40.7128;
    const longitude = parseFloat(req.query.longitude as string) || -74.006;
    const radius = parseFloat(req.query.radius as string) || 25;
    const serviceType = req.query.serviceType as string;
    const minRating = req.query.minRating ? parseFloat(req.query.minRating as string) : undefined;
    const maxRate = req.query.maxRate ? parseFloat(req.query.maxRate as string) : undefined;
    const isInsured = req.query.isInsured === 'true' ? true : undefined;
    const isBackgroundChecked = req.query.isBackgroundChecked === 'true' ? true : undefined;
    const isVerified = req.query.isVerified === 'true' ? true : undefined;
    const sortBy = req.query.sortBy as 'distance' | 'rating' | 'price' | 'responseTime' | undefined;

    const result = await ProviderSearchService.searchProvidersByLocation({
      latitude,
      longitude,
      radius,
      serviceType,
      minRating,
      maxRate,
      isInsured,
      isBackgroundChecked,
      isVerified,
      sortBy,
      sortOrder: 'asc',
      page: 1,
      limit: 50,
    });

    const providers = result.data.map(provider => ({
      id: provider.id,
      businessName: provider.businessName,
      description: provider.description,
      services: provider.services,
      location: provider.location,
      rating: provider.rating,
      totalReviews: provider.totalReviews,
      distance: provider.distance,
      distanceText: provider.distanceText,
      duration: provider.duration,
      durationText: provider.durationText,
      hourlyRate: provider.pricing.baseRate,
      pricing: provider.pricing,
      isAvailable: provider.availability,
      isInsured: provider.isInsured,
      isBackgroundChecked: provider.isBackgroundChecked,
      isVerified: provider.isVerified,
      profileImage: provider.profileImage,
      responseTime: `Usually responds within ${Math.round(provider.averageResponseTime / 60)} hour${Math.round(provider.averageResponseTime / 60) !== 1 ? 's' : ''}`,
      averageResponseTime: provider.averageResponseTime,
      responseRate: provider.responseRate,
      completedJobs: provider.completedJobs,
    }));

    res.json({
      success: true,
      data: {
        providers,
        totalCount: result.pagination.total,
        page: result.pagination.page,
        totalPages: result.pagination.pages,
        searchParams: { latitude, longitude, radius },
      },
    });
  } catch (error) {
    console.error('Provider search error:', error);
    res.status(500).json({ success: false, error: 'Failed to search providers' });
  }
});

// GET by address (geocodes then searches)
router.get('/providers/address-search', LocationController.searchProvidersByAddress);

// GET nearest providers
router.get('/providers/nearest', LocationController.findNearestProviders);

// GET providers in service area
router.get('/providers/service-area', LocationController.getProvidersInServiceArea);

// --- Nearby places (Google Places API) ---
// Frontend calls POST with body; adapt to controller which reads query params
router.post('/nearby-search', async (req, res) => {
  req.query.latitude = req.body.latitude?.toString();
  req.query.longitude = req.body.longitude?.toString();
  req.query.radius = req.body.radius?.toString();
  req.query.type = req.body.type;
  return LocationController.searchNearbyPlaces(req, res);
});

// GET /places/:placeId
router.get('/places/:placeId', LocationController.getPlaceDetails);

export default router;
