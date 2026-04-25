import { Repository } from 'typeorm';
import { AppDataSource } from '@/config/database';
import { Provider } from '@/models/Provider';
import { User, UserType } from '@/models/User';
import logger from '@/config/logger';
import { CreateProviderRequest, UpdateProviderRequest, ProviderSearchQuery } from '@/types';

export class ProviderService {
  private providerRepository: Repository<Provider>;
  private userRepository: Repository<User>;

  constructor() {
    this.providerRepository = AppDataSource.getRepository(Provider);
    this.userRepository = AppDataSource.getRepository(User);
  }

  async createProvider(userId: string, providerData: CreateProviderRequest): Promise<Provider> {
    try {
      // Verify user exists and is of provider type
      const user = await this.userRepository.findOne({
        where: { id: userId, userType: UserType.PROVIDER },
      });

      if (!user) {
        throw new Error('User not found or not a provider');
      }

      // Check if provider profile already exists
      const existingProvider = await this.providerRepository.findOne({
        where: { userId },
      });

      if (existingProvider) {
        throw new Error('Provider profile already exists for this user');
      }

      // Create provider profile
      const provider = this.providerRepository.create({
        userId,
        businessName: providerData.businessName,
        description: providerData.description,
        services: providerData.services,
        location: providerData.location,
        serviceRadius: providerData.serviceRadius || 25.0,
        availableHours: providerData.availableHours,
        pricing: providerData.pricing,
        certifications: providerData.certifications || [],
        insurance: providerData.insurance,
        portfolioImages: providerData.portfolioImages || [],
      });

      const savedProvider = await this.providerRepository.save(provider);
      logger.info(`Provider profile created for user ${userId}`, { providerId: savedProvider.id });

      return savedProvider;
    } catch (error) {
      logger.error('Error creating provider profile:', error);
      throw error;
    }
  }

  async getProviderById(providerId: string): Promise<Provider | null> {
    try {
      const provider = await this.providerRepository.findOne({
        where: { id: providerId },
        relations: ['user', 'reviews'],
      });

      return provider;
    } catch (error) {
      logger.error('Error fetching provider by ID:', error);
      throw error;
    }
  }

  async getProviderByUserId(userId: string): Promise<Provider | null> {
    try {
      const provider = await this.providerRepository.findOne({
        where: { userId },
        relations: ['user', 'reviews'],
      });

      return provider;
    } catch (error) {
      logger.error('Error fetching provider by user ID:', error);
      throw error;
    }
  }

  async updateProvider(providerId: string, updateData: UpdateProviderRequest): Promise<Provider> {
    try {
      const provider = await this.providerRepository.findOne({
        where: { id: providerId },
      });

      if (!provider) {
        throw new Error('Provider not found');
      }

      // Update provider fields
      Object.assign(provider, updateData);
      provider.updatedAt = new Date();

      const updatedProvider = await this.providerRepository.save(provider);
      logger.info(`Provider profile updated`, { providerId });

      return updatedProvider;
    } catch (error) {
      logger.error('Error updating provider:', error);
      throw error;
    }
  }

  async updateProviderByUserId(userId: string, updateData: Partial<Provider>): Promise<Provider> {
    const provider = await this.providerRepository.findOne({ where: { userId } });
    if (!provider) throw new Error('Provider not found');
    Object.assign(provider, updateData);
    provider.updatedAt = new Date();
    return this.providerRepository.save(provider);
  }

  async searchProviders(query: ProviderSearchQuery): Promise<{
    providers: Provider[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      const {
        services,
        latitude,
        longitude,
        radius = 25,
        city,
        state,
        minRating,
        isInsured,
        isBackgroundChecked,
        page = 1,
        limit = 20,
        sortBy = 'distance',
      } = query;

      let queryBuilder = this.providerRepository
        .createQueryBuilder('provider')
        .leftJoinAndSelect('provider.user', 'user')
        .leftJoinAndSelect('provider.reviews', 'reviews')
        .where('provider.isActive = :isActive', { isActive: true })
        .andWhere('user.isActive = :userIsActive', { userIsActive: true });

      // Filter by services — cast jsonb to text then use ILIKE (PostgreSQL-compatible)
      if (services && services.length > 0) {
        const serviceParams: Record<string, string> = {};
        const serviceCondition = services.map((service, index) => {
          const paramName = `service_${index}`;
          serviceParams[paramName] = `%${service.replace(/_/g, ' ')}%`;
          return `provider.services::text ILIKE :${paramName}`;
        }).join(' OR ');

        queryBuilder = queryBuilder.andWhere(`(${serviceCondition})`, serviceParams);
      }

      // Filter by GPS bounding box when coordinates are available
      if (latitude && longitude) {
        const latDiff = 0.009 * radius; // roughly 1km = 0.009 degrees
        const lngDiff = 0.009 * radius;
        queryBuilder = queryBuilder.andWhere(
          `CAST(provider.location->>'latitude' AS float) BETWEEN :minLat AND :maxLat`,
          { minLat: latitude - latDiff, maxLat: latitude + latDiff }
        ).andWhere(
          `CAST(provider.location->>'longitude' AS float) BETWEEN :minLng AND :maxLng`,
          { minLng: longitude - lngDiff, maxLng: longitude + lngDiff }
        );
      } else if (city) {
        // Fallback: city/state text match when GPS coordinates are not available
        queryBuilder = queryBuilder.andWhere(
          `LOWER(provider.location->>'city') = LOWER(:city)`,
          { city }
        );
        if (state) {
          queryBuilder = queryBuilder.andWhere(
            `LOWER(provider.location->>'state') = LOWER(:state)`,
            { state }
          );
        }
      }

      // Filter by minimum rating
      if (minRating) {
        queryBuilder = queryBuilder.andWhere('provider.rating >= :minRating', { minRating });
      }

      // Filter by insurance status
      if (isInsured !== undefined) {
        queryBuilder = queryBuilder.andWhere('provider.isInsured = :isInsured', { isInsured });
      }

      // Filter by background check status
      if (isBackgroundChecked !== undefined) {
        queryBuilder = queryBuilder.andWhere(
          'provider.isBackgroundChecked = :isBackgroundChecked',
          { isBackgroundChecked }
        );
      }

      // Apply sorting
      switch (sortBy) {
        case 'rating':
          queryBuilder = queryBuilder.orderBy('provider.rating', 'DESC');
          break;
        case 'price':
          queryBuilder = queryBuilder.orderBy(`CAST(provider.pricing->>'baseRate' AS float)`, 'ASC');
          break;
        case 'distance':
        default:
          queryBuilder = queryBuilder.orderBy('provider.rating', 'DESC');
          break;
      }

      // Apply pagination
      const offset = (page - 1) * limit;
      queryBuilder = queryBuilder.skip(offset).take(limit);

      const [providers, total] = await queryBuilder.getManyAndCount();

      logger.info(`Provider search completed`, {
        total,
        page,
        limit,
        filters: { services, latitude, longitude, radius, minRating },
      });

      return {
        providers,
        total,
        page,
        limit,
      };
    } catch (error) {
      logger.error('Error searching providers:', error);
      throw error;
    }
  }

  /**
   * Get all distinct service names offered by active providers.
   * Used by Search Agent to build the service catalog for LLM inference.
   */
  async getServiceCatalog(): Promise<string[]> {
    try {
      const providers = await this.providerRepository.find({
        where: { isActive: true },
        select: ['services'],
      });

      // Flatten all services arrays and deduplicate
      const allServices = new Set<string>();
      for (const provider of providers) {
        for (const service of provider.services) {
          allServices.add(service);
        }
      }

      const catalog = Array.from(allServices).sort();
      logger.info(`Service catalog loaded`, { totalServices: catalog.length });
      return catalog;
    } catch (error) {
      logger.error('Error loading service catalog:', error);
      throw error;
    }
  }

  async verifyProvider(providerId: string, isVerified: boolean): Promise<Provider> {
    try {
      const provider = await this.providerRepository.findOne({
        where: { id: providerId },
      });

      if (!provider) {
        throw new Error('Provider not found');
      }

      provider.isBackgroundChecked = isVerified;
      provider.updatedAt = new Date();

      const updatedProvider = await this.providerRepository.save(provider);
      logger.info(`Provider verification status updated`, { providerId, isVerified });

      return updatedProvider;
    } catch (error) {
      logger.error('Error updating provider verification:', error);
      throw error;
    }
  }

  async uploadPortfolioImages(providerId: string, imageUrls: string[]): Promise<Provider> {
    try {
      const provider = await this.providerRepository.findOne({
        where: { id: providerId },
      });

      if (!provider) {
        throw new Error('Provider not found');
      }

      // Add new images to existing portfolio
      const existingImages = provider.portfolioImages || [];
      provider.portfolioImages = [...existingImages, ...imageUrls];
      provider.updatedAt = new Date();

      const updatedProvider = await this.providerRepository.save(provider);
      logger.info(`Portfolio images uploaded`, { providerId, imageCount: imageUrls.length });

      return updatedProvider;
    } catch (error) {
      logger.error('Error uploading portfolio images:', error);
      throw error;
    }
  }

  async deleteProvider(providerId: string): Promise<void> {
    try {
      const provider = await this.providerRepository.findOne({
        where: { id: providerId },
      });

      if (!provider) {
        throw new Error('Provider not found');
      }

      // Soft delete - just mark as inactive
      provider.isActive = false;
      provider.updatedAt = new Date();

      await this.providerRepository.save(provider);
      logger.info(`Provider profile deactivated`, { providerId });
    } catch (error) {
      logger.error('Error deleting provider:', error);
      throw error;
    }
  }

  async updateProviderStats(providerId: string): Promise<void> {
    try {
      const provider = await this.providerRepository.findOne({
        where: { id: providerId },
        relations: ['reviews', 'bookings'],
      });

      if (!provider) {
        throw new Error('Provider not found');
      }

      // Calculate average rating
      if (provider.reviews && provider.reviews.length > 0) {
        const totalRating = provider.reviews.reduce((sum, review) => sum + review.rating, 0);
        provider.rating = totalRating / provider.reviews.length;
        provider.totalReviews = provider.reviews.length;
      }

      // Calculate completed jobs
      if (provider.bookings) {
        provider.completedJobs = provider.bookings.filter(
          (booking) => booking.status === 'completed'
        ).length;
      }

      provider.updatedAt = new Date();
      await this.providerRepository.save(provider);

      logger.info(`Provider stats updated`, { providerId });
    } catch (error) {
      logger.error('Error updating provider stats:', error);
      throw error;
    }
  }
}

export default new ProviderService();