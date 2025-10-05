import { Router } from 'express';
import { query } from 'express-validator';
import { validateRequest } from '../middleware/validation';
import { rateLimiters } from '../middleware/security';

const router = Router();

// MINIMAL PROVIDER SEARCH ENDPOINT FOR UX TESTING
router.get('/providers/search', (req, res) => {
  try {
    // Simple mock response for UX testing
    const allProviders = [
      {
        id: '1',
        businessName: 'Quick Clean Service',
        description: 'Professional house cleaning service',
        services: ['House Cleaning'],
        location: {
          latitude: 40.7589,
          longitude: -73.9851,
          address: '123 Main St, New York, NY',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'USA'
        },
        rating: 4.8,
        totalReviews: 127,
        distance: 2.3,
        distanceText: '2.3 km',
        duration: 8,
        durationText: '8 min drive',
        hourlyRate: 35,
        isAvailable: true,
        isInsured: true,
        isBackgroundChecked: true,
        isVerified: true,
        profileImage: null,
        responseTime: 'Usually responds within 1 hour'
      },
      {
        id: '2',
        businessName: 'City Plumbing Pro',
        description: 'Licensed plumbing and repairs',
        services: ['Plumbing', 'Emergency Repairs'],
        location: {
          latitude: 40.7505,
          longitude: -73.9934,
          address: '456 Oak Ave, New York, NY',
          city: 'New York',
          state: 'NY',
          zipCode: '10002',
          country: 'USA'
        },
        rating: 4.6,
        totalReviews: 89,
        distance: 3.7,
        distanceText: '3.7 km',
        duration: 12,
        durationText: '12 min drive',
        hourlyRate: 75,
        isAvailable: true,
        isInsured: true,
        isBackgroundChecked: true,
        isVerified: true,
        profileImage: null,
        responseTime: 'Usually responds within 30 minutes'
      }
    ];

    // Apply filters
    let filteredProviders = allProviders;

    // Filter by service type (convert underscore to space, case-insensitive)
    if (req.query.serviceType) {
      const searchService = (req.query.serviceType as string).replace(/_/g, ' ').toLowerCase();
      filteredProviders = filteredProviders.filter(provider =>
        provider.services.some(service => service.toLowerCase().includes(searchService))
      );
    }

    // Filter by minimum rating
    if (req.query.minRating) {
      const minRating = parseFloat(req.query.minRating as string);
      filteredProviders = filteredProviders.filter(provider => provider.rating >= minRating);
    }

    // Filter by max rate
    if (req.query.maxRate) {
      const maxRate = parseFloat(req.query.maxRate as string);
      filteredProviders = filteredProviders.filter(provider => provider.hourlyRate <= maxRate);
    }

    // Filter by insurance
    if (req.query.isInsured === 'true') {
      filteredProviders = filteredProviders.filter(provider => provider.isInsured === true);
    }

    // Filter by background check
    if (req.query.isBackgroundChecked === 'true') {
      filteredProviders = filteredProviders.filter(provider => provider.isBackgroundChecked === true);
    }

    // Filter by verified status
    if (req.query.isVerified === 'true') {
      filteredProviders = filteredProviders.filter(provider => provider.isVerified === true);
    }

    // Sort by the specified field
    if (req.query.sortBy) {
      const sortBy = req.query.sortBy as string;
      filteredProviders.sort((a, b) => {
        if (sortBy === 'distance') return a.distance - b.distance;
        if (sortBy === 'rating') return b.rating - a.rating;
        if (sortBy === 'price') return a.hourlyRate - b.hourlyRate;
        return 0;
      });
    }

    res.json({
      success: true,
      data: {
        providers: filteredProviders,
        totalCount: filteredProviders.length,
        page: 1,
        totalPages: 1,
        searchParams: {
          latitude: parseFloat(req.query.latitude as string) || 40.7128,
          longitude: parseFloat(req.query.longitude as string) || -74.006,
          radius: parseFloat(req.query.radius as string) || 25
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to search providers'
    });
  }
});

export default router;