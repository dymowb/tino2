import { AppDataSource } from '@/config/database';
import { ServiceCategory } from '@/models/ServiceCategory';
import { categorizeServiceType, categoriesForServices } from '@/data/serviceCatalog';
import logger from '@/config/logger';

/**
 * Loads the service taxonomy from the DB (the source of truth) and resolves
 * free-form request serviceTypes → categories, and provider services → covered
 * categories. Cached in-memory; call invalidate() if the catalog is edited.
 */
class ServiceCategoryService {
  private cache: ServiceCategory[] | null = null;
  private loadedAt = 0;
  private readonly TTL = 10 * 60 * 1000; // 10 min

  private async load(): Promise<ServiceCategory[]> {
    if (this.cache && Date.now() - this.loadedAt < this.TTL) return this.cache;
    try {
      const rows = await AppDataSource.getRepository(ServiceCategory).find();
      // Fall back to the seed constant if the table is somehow empty (e.g. migration
      // not yet run) so matching never silently breaks.
      this.cache = rows.length ? rows : [];
      this.loadedAt = Date.now();
      return this.cache;
    } catch (err) {
      logger.error('Failed to load service categories, using seed fallback:', err);
      return [];
    }
  }

  invalidate(): void {
    this.cache = null;
  }

  /** Resolve a request serviceType → canonical category key, or null. */
  async categorize(serviceType: string): Promise<string | null> {
    const cats = await this.load();
    return categorizeServiceType(serviceType, cats.length ? cats : undefined);
  }

  /** Categories a provider covers, from their specific services. */
  async coverageFor(services: string[]): Promise<Set<string>> {
    const cats = await this.load();
    return categoriesForServices(services, cats.length ? cats : undefined);
  }

  async getAll(): Promise<ServiceCategory[]> {
    return this.load();
  }
}

export default new ServiceCategoryService();
