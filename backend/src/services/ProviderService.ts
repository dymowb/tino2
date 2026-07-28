import { Repository } from 'typeorm';
import { AppDataSource } from '@/config/database';
import { Provider } from '@/models/Provider';
import { User, UserType } from '@/models/User';
import logger from '@/config/logger';
import { CreateProviderRequest, UpdateProviderRequest, ProviderSearchQuery } from '@/types';

// Great-circle distance (km) from the search center (:cLat,:cLng) to a provider's
// stored lat/lng. LEAST/GREATEST clamp the acos argument so float rounding can't
// push it outside [-1,1] (which would raise a domain error). Used for both the
// radius filter and the distance sort so "25km" means a real 25km circle, not the
// square bounding box (whose corners reach ~1.4× the radius).
const HAVERSINE_KM = `(6371 * acos(LEAST(1, GREATEST(-1, cos(radians(:cLat)) * cos(radians(CAST(provider.location->>'latitude' AS float))) * cos(radians(CAST(provider.location->>'longitude' AS float)) - radians(:cLng)) + sin(radians(:cLat)) * sin(radians(CAST(provider.location->>'latitude' AS float)))))))`;

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
        // Only expose public user fields on this unauthenticated bulk endpoint —
        // never email/phone/settings/suspension/stripe IDs (password+tokens are
        // already select:false at the entity level).
        .leftJoin('provider.user', 'user')
        .addSelect([
          'user.id',
          'user.firstName',
          'user.lastName',
          'user.profileImage',
          'user.userType',
          'user.isActive',
          'user.createdAt',
        ])
        // NB: no reviews join here — this list uses the denormalized
        // provider.rating/totalReviews, and joining the one-to-many collection
        // breaks distance-sorted pagination (TypeORM can't ORDER BY a computed
        // expression through its distinct two-query path).
        .where('provider.isActive = :isActive', { isActive: true })
        .andWhere('user.isActive = :userIsActive', { userIsActive: true });

      // Filter by services — cast jsonb to text then use ILIKE (PostgreSQL-compatible)
      if (services && services.length > 0) {
        const serviceParams: Record<string, string> = {};
        const serviceCondition = services
          .map((service, index) => {
            const paramName = `service_${index}`;
            serviceParams[paramName] = `%${service.replace(/_/g, ' ')}%`;
            return `provider.services::text ILIKE :${paramName}`;
          })
          .join(' OR ');

        queryBuilder = queryBuilder.andWhere(`(${serviceCondition})`, serviceParams);
      }

      // Filter by location: a cheap lat/lng bounding box pre-filters candidates
      // (index/scan-friendly), then a true Haversine distance enforces an actual
      // circular radius — the bbox alone is a square, so its corners would admit
      // providers up to ~1.4× the requested radius away.
      if (latitude && longitude) {
        const latDiff = 0.009 * radius; // ~1km ≈ 0.009°; generous square pre-filter
        const lngDiff = 0.009 * radius;
        queryBuilder = queryBuilder
          .andWhere(`CAST(provider.location->>'latitude' AS float) BETWEEN :minLat AND :maxLat`, {
            minLat: latitude - latDiff,
            maxLat: latitude + latDiff,
          })
          .andWhere(`CAST(provider.location->>'longitude' AS float) BETWEEN :minLng AND :maxLng`, {
            minLng: longitude - lngDiff,
            maxLng: longitude + lngDiff,
          })
          .andWhere(`${HAVERSINE_KM} <= :radiusKm`)
          .setParameters({ cLat: latitude, cLng: longitude, radiusKm: radius });
      } else if (city) {
        // Fallback: city/state text match when GPS coordinates are not available
        queryBuilder = queryBuilder.andWhere(`LOWER(provider.location->>'city') = LOWER(:city)`, {
          city,
        });
        if (state) {
          queryBuilder = queryBuilder.andWhere(
            `LOWER(provider.location->>'state') = LOWER(:state)`,
            { state }
          );
        }
      }

      // Filter by minimum rating — exclude NaN (providers with no reviews) since PostgreSQL NaN > any number
      if (minRating) {
        queryBuilder = queryBuilder.andWhere(
          "provider.rating IS NOT NULL AND provider.rating::text != 'NaN' AND provider.rating >= :minRating",
          { minRating }
        );
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

      // Distance sort is done in JS (the radius WHERE already bounds the set to a
      // small list): TypeORM's join+pagination order-by can't take a computed SQL
      // expression. Other sorts use DB order + DB pagination as usual.
      const offset = (page - 1) * limit;
      let providers: Provider[];
      let total: number;

      if (sortBy === 'distance' && latitude && longitude) {
        const all = await queryBuilder.getMany();
        const dist = (p: Provider) => {
          const loc: any = p.location || {};
          const la = Number(loc.latitude),
            lo = Number(loc.longitude);
          if (!la || !lo) return Number.POSITIVE_INFINITY;
          const toRad = (d: number) => (d * Math.PI) / 180;
          const dLat = toRad(la - latitude),
            dLng = toRad(lo - longitude);
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(latitude)) * Math.cos(toRad(la)) * Math.sin(dLng / 2) ** 2;
          return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        };
        all.sort((a, b) => dist(a) - dist(b));
        total = all.length;
        providers = all.slice(offset, offset + limit);
      } else {
        switch (sortBy) {
          case 'price':
            queryBuilder = queryBuilder.orderBy(
              `CAST(provider.pricing->>'baseRate' AS float)`,
              'ASC'
            );
            break;
          case 'rating':
          default:
            queryBuilder = queryBuilder.orderBy('provider.rating', 'DESC');
            break;
        }
        [providers, total] = await queryBuilder.skip(offset).take(limit).getManyAndCount();
      }

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
