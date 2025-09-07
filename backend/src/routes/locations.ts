import { Router } from 'express';
import { body, query, param } from 'express-validator';
import locationController from '../controllers/LocationController';
import { validateRequest } from '../middleware/validation';
import { rateLimiters } from '../middleware/security';

const router = Router();

// Validation rules
const geocodeValidation = [
  body('address')
    .isString()
    .isLength({ min: 5, max: 200 })
    .withMessage('Address must be between 5 and 200 characters'),
];

const reverseGeocodeValidation = [
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
];

const distanceCalculationValidation = [
  body('origin.lat')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Origin latitude must be between -90 and 90'),
  body('origin.lng')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Origin longitude must be between -180 and 180'),
  body('destination.lat')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Destination latitude must be between -90 and 90'),
  body('destination.lng')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Destination longitude must be between -180 and 180'),
  body('mode')
    .optional()
    .isIn(['driving', 'walking', 'transit'])
    .withMessage('Mode must be driving, walking, or transit'),
];

const locationSearchValidation = [
  query('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  query('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  query('radius')
    .optional()
    .isFloat({ min: 0.1, max: 100 })
    .withMessage('Radius must be between 0.1 and 100 km'),
  query('serviceType')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage('Service type must be a string with max 100 characters'),
  query('minRating')
    .optional()
    .isFloat({ min: 0, max: 5 })
    .withMessage('Minimum rating must be between 0 and 5'),
  query('maxRate')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum rate must be a positive number'),
  query('isInsured')
    .optional()
    .isBoolean()
    .withMessage('isInsured must be a boolean'),
  query('isBackgroundChecked')
    .optional()
    .isBoolean()
    .withMessage('isBackgroundChecked must be a boolean'),
  query('isVerified')
    .optional()
    .isBoolean()
    .withMessage('isVerified must be a boolean'),
  query('sortBy')
    .optional()
    .isIn(['distance', 'rating', 'price', 'responseTime'])
    .withMessage('sortBy must be one of: distance, rating, price, responseTime'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('sortOrder must be asc or desc'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  query('availabilityDate')
    .optional()
    .isISO8601()
    .withMessage('Availability date must be a valid ISO8601 date'),
  query('availabilityStartTime')
    .optional()
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Availability start time must be in HH:MM format'),
  query('availabilityEndTime')
    .optional()
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Availability end time must be in HH:MM format'),
];

const addressSearchValidation = [
  query('address')
    .isString()
    .isLength({ min: 5, max: 200 })
    .withMessage('Address must be between 5 and 200 characters'),
  query('radius')
    .optional()
    .isFloat({ min: 0.1, max: 100 })
    .withMessage('Radius must be between 0.1 and 100 km'),
  // Include other search parameters
  query('serviceType')
    .optional()
    .isString()
    .isLength({ max: 100 }),
  query('minRating')
    .optional()
    .isFloat({ min: 0, max: 5 }),
  query('maxRate')
    .optional()
    .isFloat({ min: 0 }),
  query('sortBy')
    .optional()
    .isIn(['distance', 'rating', 'price', 'responseTime']),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc']),
  query('page')
    .optional()
    .isInt({ min: 1 }),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 }),
];

const nearestProvidersValidation = [
  query('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  query('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  query('count')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Count must be between 1 and 50'),
  query('serviceType')
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage('Service type must be a string with max 100 characters'),
];

const nearbyPlacesValidation = [
  query('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  query('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  query('radius')
    .optional()
    .isInt({ min: 100, max: 50000 })
    .withMessage('Radius must be between 100 and 50000 meters'),
  query('type')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('Type must be a string with max 50 characters'),
];

const placeIdValidation = [
  param('placeId')
    .isString()
    .isLength({ min: 10, max: 200 })
    .withMessage('Place ID must be between 10 and 200 characters'),
];

// Geocoding endpoints
router.post(
  '/geocode',
  rateLimiters.general,
  geocodeValidation,
  validateRequest,
  locationController.geocodeAddress
);

router.post(
  '/reverse-geocode',
  rateLimiters.general,
  reverseGeocodeValidation,
  validateRequest,
  locationController.reverseGeocode
);

// Distance calculation
router.post(
  '/distance',
  rateLimiters.general,
  distanceCalculationValidation,
  validateRequest,
  locationController.calculateDistance
);

// Provider search endpoints (FR-022 to FR-028)
router.get(
  '/providers/search',
  rateLimiters.general,
  locationSearchValidation,
  validateRequest,
  locationController.searchProvidersByLocation
);

router.get(
  '/providers/search-by-address',
  rateLimiters.general,
  addressSearchValidation,
  validateRequest,
  locationController.searchProvidersByAddress
);

router.get(
  '/providers/nearest',
  rateLimiters.general,
  nearestProvidersValidation,
  validateRequest,
  locationController.findNearestProviders
);

router.get(
  '/providers/service-area',
  rateLimiters.general,
  locationSearchValidation,
  validateRequest,
  locationController.getProvidersInServiceArea
);

// Places API endpoints
router.get(
  '/places/nearby',
  rateLimiters.general,
  nearbyPlacesValidation,
  validateRequest,
  locationController.searchNearbyPlaces
);

router.get(
  '/places/:placeId',
  rateLimiters.general,
  placeIdValidation,
  validateRequest,
  locationController.getPlaceDetails
);

export default router;