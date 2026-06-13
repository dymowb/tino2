import { Request, Response } from 'express';
import LocationService from '../services/LocationService';
import ProviderSearchService from '../services/ProviderSearchService';
import { LocationSearchParams } from '../services/ProviderSearchService';
import logger from '@/config/logger';

class LocationController {
  
  /**
   * Geocode an address to get coordinates
   */
  geocodeAddress = async (req: Request, res: Response): Promise<void> => {
    try {
      const { address } = req.body;

      if (!address || typeof address !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Address is required',
        });
        return;
      }

      const result = await LocationService.geocodeAddress(address);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to geocode address',
      });
    }
  };

  /**
   * Reverse geocode coordinates to get address
   */
  reverseGeocode = async (req: Request, res: Response): Promise<void> => {
    try {
      const { latitude, longitude } = req.body;

      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        res.status(400).json({
          success: false,
          error: 'Valid latitude and longitude are required',
        });
        return;
      }

      const result = await LocationService.reverseGeocode(latitude, longitude);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reverse geocode coordinates',
      });
    }
  };

  /**
   * Calculate distance between two points
   */
  calculateDistance = async (req: Request, res: Response): Promise<void> => {
    try {
      const { origin, destination, mode = 'driving' } = req.body;

      if (!origin?.lat || !origin?.lng || !destination?.lat || !destination?.lng) {
        res.status(400).json({
          success: false,
          error: 'Valid origin and destination coordinates are required',
        });
        return;
      }

      const result = await LocationService.calculateDistance(origin, destination, mode);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to calculate distance',
      });
    }
  };

  /**
   * Search providers by location coordinates (FR-022, FR-023)
   */
  searchProvidersByLocation = async (req: Request, res: Response): Promise<void> => {
    try {
      const params: LocationSearchParams = {
        latitude: parseFloat(req.query.latitude as string),
        longitude: parseFloat(req.query.longitude as string),
        radius: parseFloat(req.query.radius as string) || 10,
        serviceType: req.query.serviceType as string,
        minRating: req.query.minRating ? parseFloat(req.query.minRating as string) : undefined,
        maxRate: req.query.maxRate ? parseFloat(req.query.maxRate as string) : undefined,
        isInsured: req.query.isInsured === 'true' ? true : req.query.isInsured === 'false' ? false : undefined,
        isBackgroundChecked: req.query.isBackgroundChecked === 'true' ? true : req.query.isBackgroundChecked === 'false' ? false : undefined,
        isVerified: req.query.isVerified === 'true' ? true : req.query.isVerified === 'false' ? false : undefined,
        sortBy: req.query.sortBy as 'distance' | 'rating' | 'price' | 'responseTime',
        sortOrder: req.query.sortOrder as 'asc' | 'desc',
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      };

      // Validate required parameters
      if (isNaN(params.latitude) || isNaN(params.longitude)) {
        res.status(400).json({
          success: false,
          error: 'Valid latitude and longitude are required',
        });
        return;
      }

      // Handle availability filter if provided
      if (req.query.availabilityDate && req.query.availabilityStartTime && req.query.availabilityEndTime) {
        params.availability = {
          date: new Date(req.query.availabilityDate as string),
          startTime: req.query.availabilityStartTime as string,
          endTime: req.query.availabilityEndTime as string,
        };
      }

      const result = await ProviderSearchService.searchProvidersByLocation(params);

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to search providers by location',
      });
    }
  };

  /**
   * Search providers by address (FR-024)
   */
  searchProvidersByAddress = async (req: Request, res: Response): Promise<void> => {
    try {
      const { address } = req.query;
      const radius = parseFloat(req.query.radius as string) || 10;

      if (!address || typeof address !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Address is required',
        });
        return;
      }

      const options = {
        serviceType: req.query.serviceType as string,
        minRating: req.query.minRating ? parseFloat(req.query.minRating as string) : undefined,
        maxRate: req.query.maxRate ? parseFloat(req.query.maxRate as string) : undefined,
        isInsured: req.query.isInsured === 'true' ? true : req.query.isInsured === 'false' ? false : undefined,
        isBackgroundChecked: req.query.isBackgroundChecked === 'true' ? true : req.query.isBackgroundChecked === 'false' ? false : undefined,
        isVerified: req.query.isVerified === 'true' ? true : req.query.isVerified === 'false' ? false : undefined,
        sortBy: req.query.sortBy as 'distance' | 'rating' | 'price' | 'responseTime',
        sortOrder: req.query.sortOrder as 'asc' | 'desc',
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      };

      const result = await ProviderSearchService.searchProvidersByAddress(address, radius, options);

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to search providers by address',
      });
    }
  };

  /**
   * Find nearest providers (FR-025)
   */
  findNearestProviders = async (req: Request, res: Response): Promise<void> => {
    try {
      const latitude = parseFloat(req.query.latitude as string);
      const longitude = parseFloat(req.query.longitude as string);
      const count = req.query.count ? parseInt(req.query.count as string) : 10;
      const serviceType = req.query.serviceType as string;

      if (isNaN(latitude) || isNaN(longitude)) {
        res.status(400).json({
          success: false,
          error: 'Valid latitude and longitude are required',
        });
        return;
      }

      const result = await ProviderSearchService.findNearestProviders(latitude, longitude, count, serviceType);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to find nearest providers',
      });
    }
  };

  /**
   * Get providers available in service area
   */
  getProvidersInServiceArea = async (req: Request, res: Response): Promise<void> => {
    try {
      const latitude = parseFloat(req.query.latitude as string);
      const longitude = parseFloat(req.query.longitude as string);
      const serviceType = req.query.serviceType as string;

      if (isNaN(latitude) || isNaN(longitude)) {
        res.status(400).json({
          success: false,
          error: 'Valid latitude and longitude are required',
        });
        return;
      }

      const result = await ProviderSearchService.getProvidersInServiceArea(latitude, longitude, serviceType);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get providers in service area',
      });
    }
  };

  /**
   * Search nearby places using Google Places API
   */
  searchNearbyPlaces = async (req: Request, res: Response): Promise<void> => {
    try {
      const latitude = parseFloat(req.query.latitude as string);
      const longitude = parseFloat(req.query.longitude as string);
      const radius = req.query.radius ? parseInt(req.query.radius as string) : 5000;
      const type = req.query.type as string;

      if (isNaN(latitude) || isNaN(longitude)) {
        res.status(400).json({
          success: false,
          error: 'Valid latitude and longitude are required',
        });
        return;
      }

      const result = await LocationService.nearbySearch({ lat: latitude, lng: longitude }, radius, type);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to search nearby places',
      });
    }
  };

  /**
   * Get place details by place ID
   */
  getPlaceDetails = async (req: Request, res: Response): Promise<void> => {
    try {
      const { placeId } = req.params;

      if (!placeId) {
        res.status(400).json({
          success: false,
          error: 'Place ID is required',
        });
        return;
      }

      const result = await LocationService.getPlaceDetails(placeId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get place details',
      });
    }
  };

  // GET /locations/autocomplete?input=...
  autocomplete = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = (req.query.input as string) || '';
      const predictions = await LocationService.autocomplete(input);
      res.json({ success: true, data: predictions });
    } catch (error) {
      // Autocomplete is best-effort: if Places API is unavailable (e.g. not
      // enabled for the key → 403), degrade to no suggestions rather than a 500.
      // The client falls back to free-text + geocode validation.
      logger.warn('Autocomplete unavailable, returning empty:', error instanceof Error ? error.message : error);
      res.json({ success: true, data: [] });
    }
  };

  // GET /locations/resolve-place/:placeId → structured address + coords
  resolvePlace = async (req: Request, res: Response): Promise<void> => {
    try {
      const { placeId } = req.params;
      if (!placeId) {
        res.status(400).json({ success: false, error: 'Place ID is required' });
        return;
      }
      const location = await LocationService.resolvePlace(placeId);
      res.json({ success: true, data: location });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to resolve place',
      });
    }
  };
}

export default new LocationController();