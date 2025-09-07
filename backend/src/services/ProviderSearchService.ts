import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Provider } from '../models/Provider';
import { User } from '../models/User';
import LocationService from './LocationService';
import logger from '../config/logger';
import { PaginatedResponse } from '../types';

export interface LocationSearchParams {
  latitude: number;
  longitude: number;
  radius: number; // in kilometers
  serviceType?: string;
  minRating?: number;
  maxRate?: number;
  isInsured?: boolean;
  isBackgroundChecked?: boolean;
  isVerified?: boolean;
  availability?: {
    date: Date;
    startTime: string;
    endTime: string;
  };
  sortBy?: 'distance' | 'rating' | 'price' | 'responseTime';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface ProviderSearchResult {
  id: string;
  userId: string;
  businessName: string;
  description: string;
  services: string[];
  location: {
    latitude: number;
    longitude: number;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  rating: number;
  totalReviews: number;
  distance: number;
  distanceText: string;
  duration: number;
  durationText: string;
  pricing: {
    baseRate: number;
    currency: string;
    rateType: 'hourly' | 'fixed' | 'quote';
  };
  isInsured: boolean;
  isBackgroundChecked: boolean;
  isVerified: boolean;
  responseRate: number;
  averageResponseTime: number;
  completedJobs: number;
  profileImage?: string;
  portfolioImages: string[];
  availability: boolean;
  verifiedAt?: Date;
}

export interface ServiceDiscoveryResult extends PaginatedResponse<ProviderSearchResult> {
  searchCenter: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  searchRadius: number;
  filters: LocationSearchParams;
}

export class ProviderSearchService {
  private providerRepository: Repository<Provider>;
  private userRepository: Repository<User>;

  constructor() {
    this.providerRepository = AppDataSource.getRepository(Provider);
    this.userRepository = AppDataSource.getRepository(User);
  }

  /**
   * Search for providers within a geographic radius (FR-022, FR-023)
   */
  async searchProvidersByLocation(params: LocationSearchParams): Promise<ServiceDiscoveryResult> {
    try {
      const page = params.page || 1;
      const limit = Math.min(params.limit || 20, 50);
      const offset = (page - 1) * limit;

      // Build the base query
      let query = this.providerRepository
        .createQueryBuilder('provider')
        .leftJoinAndSelect('provider.user', 'user')
        .where('provider.isActive = :isActive', { isActive: true })
        .andWhere('user.isActive = :userIsActive', { userIsActive: true });

      // Apply filters
      if (params.serviceType) {
        query = query.andWhere('JSON_EXTRACT(provider.services, "$") LIKE :serviceType', {
          serviceType: `%${params.serviceType}%`
        });
      }

      if (params.minRating !== undefined) {
        query = query.andWhere('provider.rating >= :minRating', { minRating: params.minRating });
      }

      if (params.isInsured !== undefined) {
        query = query.andWhere('provider.isInsured = :isInsured', { isInsured: params.isInsured });
      }

      if (params.isBackgroundChecked !== undefined) {
        query = query.andWhere('provider.isBackgroundChecked = :isBackgroundChecked', { 
          isBackgroundChecked: params.isBackgroundChecked 
        });
      }

      if (params.isVerified !== undefined) {
        if (params.isVerified) {
          query = query.andWhere('provider.verifiedAt IS NOT NULL');
        } else {
          query = query.andWhere('provider.verifiedAt IS NULL');
        }
      }

      if (params.maxRate !== undefined) {
        query = query.andWhere('JSON_EXTRACT(provider.pricing, "$.baseRate") <= :maxRate', { 
          maxRate: params.maxRate 
        });
      }

      // Get all matching providers (we'll filter by distance after)
      const providers = await query.getMany();

      // Filter providers by distance and calculate distances
      const providersWithDistance: Array<ProviderSearchResult & { rawDistance: number }> = [];

      for (const provider of providers) {
        const distance = LocationService.calculateStraightLineDistance(
          { lat: params.latitude, lng: params.longitude },
          { lat: provider.location.latitude, lng: provider.location.longitude }
        );

        // Filter by radius
        if (distance <= params.radius) {
          // Calculate route-based distance for accurate travel time
          let routeDistance = distance;
          let routeDuration = Math.round(distance * 2); // Rough estimate: 2 minutes per km

          try {
            const routeInfo = await LocationService.calculateDistance(
              { lat: params.latitude, lng: params.longitude },
              { lat: provider.location.latitude, lng: provider.location.longitude },
              'driving'
            );
            routeDistance = routeInfo.distance;
            routeDuration = routeInfo.duration;
          } catch (error) {
            logger.warn(`Failed to calculate route distance for provider ${provider.id}:`, error);
          }

          // Check availability if specified
          let isAvailable = true;
          if (params.availability) {
            isAvailable = await this.checkProviderAvailability(provider, params.availability);
          }

          providersWithDistance.push({
            id: provider.id,
            userId: provider.userId,
            businessName: provider.businessName,
            description: provider.description,
            services: provider.services,
            location: provider.location,
            rating: provider.rating,
            totalReviews: provider.totalReviews,
            distance: routeDistance,
            distanceText: `${routeDistance} km`,
            duration: routeDuration,
            durationText: `${routeDuration} min`,
            pricing: provider.pricing || { baseRate: 0, currency: 'USD', rateType: 'quote' },
            isInsured: provider.isInsured,
            isBackgroundChecked: provider.isBackgroundChecked,
            isVerified: !!provider.verifiedAt,
            responseRate: provider.responseRate,
            averageResponseTime: provider.averageResponseTime,
            completedJobs: provider.completedJobs,
            profileImage: provider.user?.profileImage,
            portfolioImages: provider.portfolioImages || [],
            availability: isAvailable,
            verifiedAt: provider.verifiedAt,
            rawDistance: distance,
          });
        }
      }

      // Sort results
      this.sortProviders(providersWithDistance, params.sortBy || 'distance', params.sortOrder || 'asc');

      // Apply pagination
      const total = providersWithDistance.length;
      const paginatedResults = providersWithDistance.slice(offset, offset + limit);

      // Remove rawDistance from final results
      const finalResults = paginatedResults.map(({ rawDistance, ...provider }) => provider);

      return {
        success: true,
        data: finalResults,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
        searchCenter: {
          latitude: params.latitude,
          longitude: params.longitude,
        },
        searchRadius: params.radius,
        filters: params,
      };
    } catch (error) {
      logger.error('Provider location search error:', error);
      throw new Error('Failed to search providers by location');
    }
  }

  /**
   * Search providers by address (geocode first, then search) (FR-024)
   */
  async searchProvidersByAddress(
    address: string, 
    radius: number = 10, 
    options: Omit<LocationSearchParams, 'latitude' | 'longitude' | 'radius'> = {}
  ): Promise<ServiceDiscoveryResult> {
    try {
      // Geocode the address first
      const geocodeResult = await LocationService.geocodeAddress(address);
      
      const searchResult = await this.searchProvidersByLocation({
        latitude: geocodeResult.location.latitude,
        longitude: geocodeResult.location.longitude,
        radius,
        ...options,
      });

      // Add address information to search center
      searchResult.searchCenter.address = geocodeResult.formattedAddress;

      return searchResult;
    } catch (error) {
      logger.error('Provider address search error:', error);
      throw new Error('Failed to search providers by address');
    }
  }

  /**
   * Find the nearest providers to a location (FR-025)
   */
  async findNearestProviders(
    latitude: number,
    longitude: number,
    count: number = 10,
    serviceType?: string
  ): Promise<ProviderSearchResult[]> {
    try {
      const result = await this.searchProvidersByLocation({
        latitude,
        longitude,
        radius: 50, // Large radius to ensure we get enough results
        serviceType,
        sortBy: 'distance',
        sortOrder: 'asc',
        limit: count,
      });

      return result.data;
    } catch (error) {
      logger.error('Nearest providers search error:', error);
      throw new Error('Failed to find nearest providers');
    }
  }

  /**
   * Get provider service areas (all providers within their service radius of a point)
   */
  async getProvidersInServiceArea(
    latitude: number,
    longitude: number,
    serviceType?: string
  ): Promise<ProviderSearchResult[]> {
    try {
      let query = this.providerRepository
        .createQueryBuilder('provider')
        .leftJoinAndSelect('provider.user', 'user')
        .where('provider.isActive = :isActive', { isActive: true })
        .andWhere('user.isActive = :userIsActive', { userIsActive: true });

      if (serviceType) {
        query = query.andWhere('JSON_EXTRACT(provider.services, "$") LIKE :serviceType', {
          serviceType: `%${serviceType}%`
        });
      }

      const providers = await query.getMany();
      const availableProviders: ProviderSearchResult[] = [];

      for (const provider of providers) {
        const distance = LocationService.calculateStraightLineDistance(
          { lat: latitude, lng: longitude },
          { lat: provider.location.latitude, lng: provider.location.longitude }
        );

        // Check if customer is within provider's service radius
        if (distance <= provider.serviceRadius) {
          // Calculate route-based distance
          let routeDistance = distance;
          let routeDuration = Math.round(distance * 2);

          try {
            const routeInfo = await LocationService.calculateDistance(
              { lat: provider.location.latitude, lng: provider.location.longitude },
              { lat: latitude, lng: longitude },
              'driving'
            );
            routeDistance = routeInfo.distance;
            routeDuration = routeInfo.duration;
          } catch (error) {
            logger.warn(`Failed to calculate route distance for provider ${provider.id}:`, error);
          }

          availableProviders.push({
            id: provider.id,
            userId: provider.userId,
            businessName: provider.businessName,
            description: provider.description,
            services: provider.services,
            location: provider.location,
            rating: provider.rating,
            totalReviews: provider.totalReviews,
            distance: routeDistance,
            distanceText: `${routeDistance} km`,
            duration: routeDuration,
            durationText: `${routeDuration} min`,
            pricing: provider.pricing || { baseRate: 0, currency: 'USD', rateType: 'quote' },
            isInsured: provider.isInsured,
            isBackgroundChecked: provider.isBackgroundChecked,
            isVerified: !!provider.verifiedAt,
            responseRate: provider.responseRate,
            averageResponseTime: provider.averageResponseTime,
            completedJobs: provider.completedJobs,
            profileImage: provider.user?.profileImage,
            portfolioImages: provider.portfolioImages || [],
            availability: true,
            verifiedAt: provider.verifiedAt,
          });
        }
      }

      // Sort by distance
      availableProviders.sort((a, b) => a.distance - b.distance);

      return availableProviders;
    } catch (error) {
      logger.error('Service area search error:', error);
      throw new Error('Failed to get providers in service area');
    }
  }

  /**
   * Check if a provider is available at a specific time
   */
  private async checkProviderAvailability(
    provider: Provider,
    availability: { date: Date; startTime: string; endTime: string }
  ): Promise<boolean> {
    try {
      const dayOfWeek = availability.date.toLocaleDateString('en-US', { weekday: 'lowercase' }) as keyof typeof provider.availableHours;
      const providerHours = provider.availableHours[dayOfWeek];

      if (!providerHours || !providerHours.available) {
        return false;
      }

      // Simple time range check (could be enhanced with actual booking conflicts)
      const requestStart = this.timeToMinutes(availability.startTime);
      const requestEnd = this.timeToMinutes(availability.endTime);
      const providerStart = this.timeToMinutes(providerHours.start);
      const providerEnd = this.timeToMinutes(providerHours.end);

      return requestStart >= providerStart && requestEnd <= providerEnd;
    } catch (error) {
      logger.warn(`Failed to check availability for provider ${provider.id}:`, error);
      return true; // Default to available if check fails
    }
  }

  /**
   * Sort providers based on criteria
   */
  private sortProviders(
    providers: Array<ProviderSearchResult & { rawDistance: number }>,
    sortBy: string,
    sortOrder: 'asc' | 'desc'
  ): void {
    const multiplier = sortOrder === 'asc' ? 1 : -1;

    providers.sort((a, b) => {
      switch (sortBy) {
        case 'distance':
          return (a.rawDistance - b.rawDistance) * multiplier;
        case 'rating':
          return (a.rating - b.rating) * multiplier;
        case 'price':
          const aPrice = a.pricing?.baseRate || 0;
          const bPrice = b.pricing?.baseRate || 0;
          return (aPrice - bPrice) * multiplier;
        case 'responseTime':
          return (a.averageResponseTime - b.averageResponseTime) * multiplier;
        default:
          return (a.rawDistance - b.rawDistance) * multiplier;
      }
    });
  }

  /**
   * Convert time string (HH:MM) to minutes since midnight
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }
}

export default new ProviderSearchService();