import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import providerService from '@/services/ProviderService';
import bookingService from '@/services/BookingService';
import reviewService from '@/services/ReviewService';
import logger from '@/config/logger';
import { ApiResponse, AuthenticatedRequest } from '@/types';
import { AvailabilitySchema } from '@/schemas/availability.schema';
import { t } from '@/i18n';

export class ProviderController {
  getFavoriteProviders = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const favorites = await providerService.getFavoriteProviders(req.user!.userId);
      res.status(200).json({
        success: true,
        data: {
          favorites: favorites.map((favorite) => ({
            id: favorite.id,
            providerId: favorite.providerId,
            createdAt: favorite.createdAt,
            provider: favorite.provider,
          })),
        },
      });
    } catch (error) {
      logger.error('Error retrieving favorite providers:', error);
      res.status(500).json({ success: false, message: 'Failed to retrieve saved providers' });
    }
  };

  addFavoriteProvider = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const favorite = await providerService.addFavoriteProvider(
        req.user!.userId,
        req.params.providerId
      );
      res.status(200).json({ success: true, data: { favorite } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save provider';
      res.status(message.includes('not found') ? 404 : 409).json({ success: false, message });
    }
  };

  removeFavoriteProvider = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    await providerService.removeFavoriteProvider(req.user!.userId, req.params.providerId);
    res.status(204).send();
  };

  createProvider = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          message: t(req, 'common.validation_failed'),
          errors: errors.array().reduce(
            (acc, err) => {
              const field = err.type === 'field' ? err.path : 'unknown';
              if (!acc[field]) acc[field] = [];
              acc[field].push(err.msg);
              return acc;
            },
            {} as Record<string, string[]>
          ),
        };
        res.status(400).json(response);
        return;
      }

      const userId = req.user?.userId;
      if (!userId) {
        const response: ApiResponse = {
          success: false,
          message: t(req, 'common.auth_required'),
        };
        res.status(401).json(response);
        return;
      }

      const provider = await providerService.createProvider(userId, req.body);

      const response: ApiResponse = {
        success: true,
        message: t(req, 'provider.created'),
        data: { provider },
      };

      res.status(201).json(response);
    } catch (error) {
      logger.error('Error in createProvider controller:', error);

      let message = 'Failed to create provider profile';
      let statusCode = 500;

      if (error instanceof Error) {
        if (error.message.includes('already exists')) {
          statusCode = 409;
          message = error.message;
        } else if (
          error.message.includes('not found') ||
          error.message.includes('not a provider')
        ) {
          statusCode = 400;
          message = error.message;
        }
      }

      const response: ApiResponse = {
        success: false,
        message,
      };

      res.status(statusCode).json(response);
    }
  };

  getProvider = async (req: Request, res: Response): Promise<void> => {
    try {
      const { providerId } = req.params;

      const provider = await providerService.getProviderById(providerId);

      if (!provider) {
        const response: ApiResponse = {
          success: false,
          message: t(req, 'provider.not_found'),
        };
        res.status(404).json(response);
        return;
      }

      // Strip sensitive user fields — this is a public endpoint. Keep only
      // fields safe to show on a public provider profile (contact + identity).
      const publicProvider = provider as any;
      if (publicProvider.user) {
        const u = publicProvider.user;
        publicProvider.user = {
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          profileImage: u.profileImage,
          userType: u.userType,
          email: u.email,
          phone: u.phone,
          isActive: u.isActive,
          createdAt: u.createdAt,
        };
      }

      const response: ApiResponse = {
        success: true,
        data: { provider: publicProvider },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in getProvider controller:', error);

      const response: ApiResponse = {
        success: false,
        message: t(req, 'provider.retrieve_failed'),
      };

      res.status(500).json(response);
    }
  };

  getMyProvider = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        const response: ApiResponse = {
          success: false,
          message: t(req, 'common.auth_required'),
        };
        res.status(401).json(response);
        return;
      }

      const provider = await providerService.getProviderByUserId(userId);

      if (!provider) {
        const response: ApiResponse = {
          success: false,
          message: t(req, 'provider.profile_not_found'),
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: { provider },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in getMyProvider controller:', error);

      const response: ApiResponse = {
        success: false,
        message: t(req, 'provider.profile_retrieve_failed'),
      };

      res.status(500).json(response);
    }
  };

  updateProvider = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          message: t(req, 'common.validation_failed'),
          errors: errors.array().reduce(
            (acc, err) => {
              const field = err.type === 'field' ? err.path : 'unknown';
              if (!acc[field]) acc[field] = [];
              acc[field].push(err.msg);
              return acc;
            },
            {} as Record<string, string[]>
          ),
        };
        res.status(400).json(response);
        return;
      }

      const { providerId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          message: t(req, 'common.auth_required'),
        };
        res.status(401).json(response);
        return;
      }

      // Verify provider belongs to user. includeInactive: a deactivated provider
      // must still be able to load and manage their own record.
      const existingProvider = await providerService.getProviderById(providerId, {
        includeInactive: true,
      });
      if (!existingProvider || existingProvider.userId !== userId) {
        const response: ApiResponse = {
          success: false,
          message: t(req, 'provider.not_found_or_denied'),
        };
        res.status(404).json(response);
        return;
      }

      const updatedProvider = await providerService.updateProvider(providerId, req.body);

      const response: ApiResponse = {
        success: true,
        message: t(req, 'provider.updated'),
        data: { provider: updatedProvider },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in updateProvider controller:', error);

      const response: ApiResponse = {
        success: false,
        message: t(req, 'provider.update_failed'),
      };

      res.status(500).json(response);
    }
  };

  searchProviders = async (req: Request, res: Response): Promise<void> => {
    try {
      const query = req.query as any;

      // Parse numeric values
      if (query.latitude) query.latitude = parseFloat(query.latitude);
      if (query.longitude) query.longitude = parseFloat(query.longitude);
      if (query.radius) query.radius = parseFloat(query.radius);
      if (query.minRating) query.minRating = parseFloat(query.minRating);
      if (query.page) query.page = parseInt(query.page);
      if (query.limit) query.limit = parseInt(query.limit);

      // Parse boolean values
      if (query.isInsured) query.isInsured = query.isInsured === 'true';
      if (query.isBackgroundChecked)
        query.isBackgroundChecked = query.isBackgroundChecked === 'true';

      // Parse array values
      if (query.services && typeof query.services === 'string') {
        query.services = query.services.split(',');
      }

      const result = await providerService.searchProviders(query);

      const response: ApiResponse = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in searchProviders controller:', error);

      const response: ApiResponse = {
        success: false,
        message: t(req, 'provider.search_failed'),
      };

      res.status(500).json(response);
    }
  };

  verifyProvider = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { providerId } = req.params;
      const { isVerified } = req.body;

      // This endpoint should only be accessible by admin users
      // Add admin check here when admin role is implemented
      if (req.user?.userType !== 'admin') {
        const response: ApiResponse = {
          success: false,
          message: t(req, 'common.admin_access_required'),
        };
        res.status(403).json(response);
        return;
      }

      const updatedProvider = await providerService.verifyProvider(providerId, isVerified);

      const response: ApiResponse = {
        success: true,
        message: `Provider ${isVerified ? 'verified' : 'unverified'} successfully`,
        data: { provider: updatedProvider },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in verifyProvider controller:', error);

      let statusCode = 500;
      let message = 'Failed to update provider verification';

      if (error instanceof Error && error.message.includes('not found')) {
        statusCode = 404;
        message = error.message;
      }

      const response: ApiResponse = {
        success: false,
        message,
      };

      res.status(statusCode).json(response);
    }
  };

  uploadPortfolio = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { providerId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          message: t(req, 'common.auth_required'),
        };
        res.status(401).json(response);
        return;
      }

      // Verify provider belongs to user. includeInactive: a deactivated provider
      // must still be able to load and manage their own record.
      const existingProvider = await providerService.getProviderById(providerId, {
        includeInactive: true,
      });
      if (!existingProvider || existingProvider.userId !== userId) {
        const response: ApiResponse = {
          success: false,
          message: t(req, 'provider.not_found_or_denied'),
        };
        res.status(404).json(response);
        return;
      }

      // In a real implementation, you would handle file uploads here
      // For now, we'll assume image URLs are provided in the request body
      const { imageUrls } = req.body;

      if (!imageUrls || !Array.isArray(imageUrls)) {
        const response: ApiResponse = {
          success: false,
          message: t(req, 'provider.image_urls_required'),
        };
        res.status(400).json(response);
        return;
      }

      const updatedProvider = await providerService.uploadPortfolioImages(providerId, imageUrls);

      const response: ApiResponse = {
        success: true,
        message: t(req, 'provider.portfolio_uploaded'),
        data: { provider: updatedProvider },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in uploadPortfolio controller:', error);

      const response: ApiResponse = {
        success: false,
        message: t(req, 'provider.portfolio_upload_failed'),
      };

      res.status(500).json(response);
    }
  };

  updateAvailability = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: t(req, 'common.auth_required') });
        return;
      }

      // Zod parse — throws ZodError with field-level details if invalid
      const parsed = AvailabilitySchema.safeParse(req.body);
      if (!parsed.success) {
        const errors = parsed.error.flatten().fieldErrors;
        res
          .status(400)
          .json({ success: false, message: t(req, 'common.validation_failed'), errors });
        return;
      }

      const provider = await providerService.updateProviderByUserId(userId, {
        availableHours: parsed.data as any,
      });

      const response: ApiResponse = { success: true, data: provider.availableHours };
      res.status(200).json(response);
    } catch (error) {
      logger.error('Error updating availability:', error);
      res
        .status(500)
        .json({ success: false, message: t(req, 'provider.availability_update_failed') });
    }
  };

  deleteProvider = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { providerId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          message: t(req, 'common.auth_required'),
        };
        res.status(401).json(response);
        return;
      }

      // Verify provider belongs to user. includeInactive: a deactivated provider
      // must still be able to load and manage their own record.
      const existingProvider = await providerService.getProviderById(providerId, {
        includeInactive: true,
      });
      if (!existingProvider || existingProvider.userId !== userId) {
        const response: ApiResponse = {
          success: false,
          message: t(req, 'provider.not_found_or_denied'),
        };
        res.status(404).json(response);
        return;
      }

      await providerService.deleteProvider(providerId);

      const response: ApiResponse = {
        success: true,
        message: t(req, 'provider.deactivated'),
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in deleteProvider controller:', error);

      const response: ApiResponse = {
        success: false,
        message: t(req, 'provider.deactivate_failed'),
      };

      res.status(500).json(response);
    }
  };

  getDashboardStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          message: t(req, 'common.auth_required'),
        };
        res.status(401).json(response);
        return;
      }

      // Get provider record using providerService
      const provider = await providerService.getProviderByUserId(userId);

      if (!provider) {
        const response: ApiResponse = {
          success: false,
          message: t(req, 'provider.profile_not_found'),
        };
        res.status(404).json(response);
        return;
      }

      // Build date range from period
      const period = (req.query.period as string) || 'month';
      const periodDays: Record<string, number> = { week: 7, month: 30, quarter: 90, year: 365 };
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - (periodDays[period] ?? 30));

      const allBookingsQuery = { providerId: provider.id, limit: 1000, dateFrom };
      const pendingQuery = { providerId: provider.id, status: 'pending', limit: 1000, dateFrom };
      const completedQuery = {
        providerId: provider.id,
        status: 'completed',
        limit: 1000,
        dateFrom,
      };

      const allBookingsResult = await bookingService.searchBookings(allBookingsQuery);
      const pendingResult = await bookingService.searchBookings(pendingQuery);
      const completedResult = await bookingService.searchBookings(completedQuery);

      // Calculate total earnings
      const totalEarnings = completedResult.bookings.reduce(
        (sum: number, booking: any) => sum + parseFloat(booking.totalAmount || 0),
        0
      );

      // Get provider reviews to calculate average rating
      const reviews = await reviewService.getProviderReviews(provider.id, { page: 1, limit: 1000 });
      const avgRating =
        reviews.data && reviews.data.length > 0
          ? reviews.data.reduce((sum: number, r: any) => sum + parseFloat(r.rating || 0), 0) /
            reviews.data.length
          : null;

      const total = allBookingsResult.total;
      const completed = completedResult.total;
      const stats = {
        totalBookings: total,
        pendingBookings: pendingResult.total,
        completedBookings: completed,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        totalEarnings,
        averageRating: avgRating !== null ? Math.round(avgRating * 10) / 10 : null,
        totalReviews: reviews.pagination?.total || 0,
        responseRate: 95, // Placeholder
      };

      const response: ApiResponse = {
        success: true,
        data: stats,
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in getDashboardStats:', error);

      const response: ApiResponse = {
        success: false,
        message: t(req, 'provider.dashboard_stats_failed'),
      };

      res.status(500).json(response);
    }
  };

  getServiceCatalog = async (req: Request, res: Response): Promise<void> => {
    try {
      const services = await providerService.getServiceCatalog();
      const response: ApiResponse = { success: true, data: { services } };
      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in getServiceCatalog controller:', error);
      res.status(500).json({ success: false, message: t(req, 'provider.catalog_failed') });
    }
  };
}

export default new ProviderController();
