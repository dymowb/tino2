import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import providerService from '@/services/ProviderService';
import bookingService from '@/services/BookingService';
import reviewService from '@/services/ReviewService';
import logger from '@/config/logger';
import { ApiResponse, AuthenticatedRequest } from '@/types';

export class ProviderController {
  createProvider = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          message: 'Validation failed',
          errors: errors.array().reduce((acc, err) => {
            const field = err.type === 'field' ? err.path : 'unknown';
            if (!acc[field]) acc[field] = [];
            acc[field].push(err.msg);
            return acc;
          }, {} as Record<string, string[]>),
        };
        res.status(400).json(response);
        return;
      }

      const userId = req.user?.userId;
      if (!userId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const provider = await providerService.createProvider(userId, req.body);

      const response: ApiResponse = {
        success: true,
        message: 'Provider profile created successfully',
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
        } else if (error.message.includes('not found') || error.message.includes('not a provider')) {
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
  }

  getProvider = async (req: Request, res: Response): Promise<void> => {
    try {
      const { providerId } = req.params;

      const provider = await providerService.getProviderById(providerId);

      if (!provider) {
        const response: ApiResponse = {
          success: false,
          message: 'Provider not found',
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
      logger.error('Error in getProvider controller:', error);

      const response: ApiResponse = {
        success: false,
        message: 'Failed to retrieve provider',
      };

      res.status(500).json(response);
    }
  }

  getMyProvider = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const provider = await providerService.getProviderByUserId(userId);

      if (!provider) {
        const response: ApiResponse = {
          success: false,
          message: 'Provider profile not found',
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
        message: 'Failed to retrieve provider profile',
      };

      res.status(500).json(response);
    }
  }

  updateProvider = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          message: 'Validation failed',
          errors: errors.array().reduce((acc, err) => {
            const field = err.type === 'field' ? err.path : 'unknown';
            if (!acc[field]) acc[field] = [];
            acc[field].push(err.msg);
            return acc;
          }, {} as Record<string, string[]>),
        };
        res.status(400).json(response);
        return;
      }

      const { providerId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      // Verify provider belongs to user
      const existingProvider = await providerService.getProviderById(providerId);
      if (!existingProvider || existingProvider.userId !== userId) {
        const response: ApiResponse = {
          success: false,
          message: 'Provider not found or access denied',
        };
        res.status(404).json(response);
        return;
      }

      const updatedProvider = await providerService.updateProvider(providerId, req.body);

      const response: ApiResponse = {
        success: true,
        message: 'Provider profile updated successfully',
        data: { provider: updatedProvider },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in updateProvider controller:', error);

      const response: ApiResponse = {
        success: false,
        message: 'Failed to update provider profile',
      };

      res.status(500).json(response);
    }
  }

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
      if (query.isBackgroundChecked) query.isBackgroundChecked = query.isBackgroundChecked === 'true';

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
        message: 'Failed to search providers',
      };

      res.status(500).json(response);
    }
  }

  verifyProvider = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { providerId } = req.params;
      const { isVerified } = req.body;

      // This endpoint should only be accessible by admin users
      // Add admin check here when admin role is implemented
      if (req.user?.userType !== 'admin') {
        const response: ApiResponse = {
          success: false,
          message: 'Admin access required',
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
  }

  uploadPortfolio = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { providerId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      // Verify provider belongs to user
      const existingProvider = await providerService.getProviderById(providerId);
      if (!existingProvider || existingProvider.userId !== userId) {
        const response: ApiResponse = {
          success: false,
          message: 'Provider not found or access denied',
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
          message: 'Image URLs array is required',
        };
        res.status(400).json(response);
        return;
      }

      const updatedProvider = await providerService.uploadPortfolioImages(providerId, imageUrls);

      const response: ApiResponse = {
        success: true,
        message: 'Portfolio images uploaded successfully',
        data: { provider: updatedProvider },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in uploadPortfolio controller:', error);

      const response: ApiResponse = {
        success: false,
        message: 'Failed to upload portfolio images',
      };

      res.status(500).json(response);
    }
  }

  deleteProvider = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { providerId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      // Verify provider belongs to user
      const existingProvider = await providerService.getProviderById(providerId);
      if (!existingProvider || existingProvider.userId !== userId) {
        const response: ApiResponse = {
          success: false,
          message: 'Provider not found or access denied',
        };
        res.status(404).json(response);
        return;
      }

      await providerService.deleteProvider(providerId);

      const response: ApiResponse = {
        success: true,
        message: 'Provider profile deactivated successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in deleteProvider controller:', error);

      const response: ApiResponse = {
        success: false,
        message: 'Failed to deactivate provider profile',
      };

      res.status(500).json(response);
    }
  }

  getDashboardStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      // Get provider record using providerService
      const provider = await providerService.getProviderByUserId(userId);

      if (!provider) {
        const response: ApiResponse = {
          success: false,
          message: 'Provider profile not found',
        };
        res.status(404).json(response);
        return;
      }

      // Get booking statistics using bookingService
      const allBookingsQuery = { providerId: provider.id, limit: 1000 };
      const pendingQuery = { providerId: provider.id, status: 'pending', limit: 1000 };
      const completedQuery = { providerId: provider.id, status: 'completed', limit: 1000 };

      const allBookingsResult = await bookingService.searchBookings(allBookingsQuery);
      const pendingResult = await bookingService.searchBookings(pendingQuery);
      const completedResult = await bookingService.searchBookings(completedQuery);

      // Calculate total earnings
      const totalEarnings = completedResult.bookings.reduce((sum: number, booking: any) =>
        sum + (booking.totalPrice || 0), 0
      );

      // Get provider reviews to calculate average rating
      const reviews = await reviewService.getProviderReviews(provider.id, { page: 1, limit: 1000 });
      const avgRating = reviews.data && reviews.data.length > 0
        ? reviews.data.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.data.length
        : 0;

      const stats = {
        totalBookings: allBookingsResult.total,
        pendingBookings: pendingResult.total,
        completedBookings: completedResult.total,
        totalEarnings,
        averageRating: Math.round(avgRating * 10) / 10,
        totalReviews: reviews.pagination?.total || 0,
        responseRate: 95 // Placeholder
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
        message: 'Failed to fetch dashboard statistics',
      };

      res.status(500).json(response);
    }
  }
}

export default new ProviderController();