import { Router } from 'express';
import { query } from 'express-validator';
import { validateRequest } from '../middleware/validation';
import { rateLimiters } from '../middleware/security';
import ProviderSearchService from '../services/ProviderSearchService';

const router = Router();

// PROVIDER SEARCH ENDPOINT - Uses real database via ProviderSearchService
router.get('/providers/search', async (req, res) => {
  try {
    // Extract and parse query parameters
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

    // Search providers using ProviderSearchService
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
      limit: 50
    });

    // Transform response to match frontend expectations
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
      responseTime: `Usually responds within ${Math.round(provider.averageResponseTime/60)} hour${Math.round(provider.averageResponseTime/60) !== 1 ? 's' : ''}`,
      averageResponseTime: provider.averageResponseTime,
      responseRate: provider.responseRate,
      completedJobs: provider.completedJobs
    }));

    res.json({
      success: true,
      data: {
        providers,
        totalCount: result.pagination.total,
        page: result.pagination.page,
        totalPages: result.pagination.pages,
        searchParams: {
          latitude,
          longitude,
          radius
        }
      }
    });
  } catch (error) {
    console.error('Provider search error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search providers'
    });
  }
});

export default router;