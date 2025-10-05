import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import bookingService from '@/services/BookingService';
import providerService from '@/services/ProviderService';
import logger from '@/config/logger';
import { ApiResponse, AuthenticatedRequest } from '@/types';

export class BookingController {
  createBooking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        };
        res.status(400).json(response);
        return;
      }

      const customerId = req.user?.userId;
      if (!customerId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      // Ensure user is a customer
      if (req.user?.userType !== 'customer') {
        const response: ApiResponse = {
          success: false,
          message: 'Customer access required',
        };
        res.status(403).json(response);
        return;
      }

      // Convert scheduledDate string to Date object
      const bookingData = {
        ...req.body,
        scheduledDate: new Date(req.body.scheduledDate),
      };

      const booking = await bookingService.createBooking(customerId, bookingData);

      const response: ApiResponse = {
        success: true,
        message: 'Booking created successfully',
        data: { booking },
      };

      res.status(201).json(response);
    } catch (error) {
      logger.error('Error in createBooking controller:', error);

      let message = 'Failed to create booking';
      let statusCode = 500;

      if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('inactive')) {
          statusCode = 404;
          message = error.message;
        } else if (error.message.includes('not available')) {
          statusCode = 409;
          message = error.message;
        } else if (error.message.includes('Customer not found')) {
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

  getBooking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { bookingId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const booking = await bookingService.getBookingById(bookingId, userId);

      if (!booking) {
        const response: ApiResponse = {
          success: false,
          message: 'Booking not found or access denied',
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: { booking },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in getBooking controller:', error);

      const response: ApiResponse = {
        success: false,
        message: 'Failed to retrieve booking',
      };

      res.status(500).json(response);
    }
  }

  updateBooking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        };
        res.status(400).json(response);
        return;
      }

      const { bookingId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      // Convert scheduledDate string to Date object if present
      const updateData = { ...req.body };
      if (updateData.scheduledDate) {
        updateData.scheduledDate = new Date(updateData.scheduledDate);
      }

      const updatedBooking = await bookingService.updateBooking(bookingId, userId, updateData);

      const response: ApiResponse = {
        success: true,
        message: 'Booking updated successfully',
        data: { booking: updatedBooking },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in updateBooking controller:', error);

      let message = 'Failed to update booking';
      let statusCode = 500;

      if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('access denied')) {
          statusCode = 404;
          message = error.message;
        } else if (error.message.includes('Cannot update') || error.message.includes('Only the customer')) {
          statusCode = 403;
          message = error.message;
        } else if (error.message.includes('not available')) {
          statusCode = 409;
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

  updateBookingStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const response: ApiResponse = {
          success: false,
          message: 'Validation failed',
          errors: errors.array(),
        };
        res.status(400).json(response);
        return;
      }

      const { bookingId } = req.params;
      const { status } = req.body;
      const userId = req.user?.userId;
      const userType = req.user?.userType;

      if (!userId || !userType) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const updatedBooking = await bookingService.updateBookingStatus(
        bookingId,
        userId,
        status,
        userType as 'customer' | 'provider'
      );

      const response: ApiResponse = {
        success: true,
        message: `Booking status updated to ${status}`,
        data: { booking: updatedBooking },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in updateBookingStatus controller:', error);

      let message = 'Failed to update booking status';
      let statusCode = 500;

      if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('access denied')) {
          statusCode = 404;
          message = error.message;
        } else if (error.message.includes('Invalid status transition')) {
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

  searchBookings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const userType = req.user?.userType;

      if (!userId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const query = req.query as any;

      // Parse query parameters
      if (query.page) query.page = parseInt(query.page);
      if (query.limit) query.limit = parseInt(query.limit);
      if (query.dateFrom) query.dateFrom = new Date(query.dateFrom);
      if (query.dateTo) query.dateTo = new Date(query.dateTo);

      // Automatically filter by user's role
      if (userType === 'customer') {
        query.customerId = userId;
      } else if (userType === 'provider') {
        // Find provider ID for this user
        query.providerId = userId; // This might need adjustment based on your provider model
      }

      const result = await bookingService.searchBookings(query);

      // Transform the response to match frontend's PaginatedResponse structure
      const response = {
        success: true,
        data: result.bookings,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          pages: Math.ceil(result.total / result.limit)
        }
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in searchBookings controller:', error);

      const response: ApiResponse = {
        success: false,
        message: 'Failed to search bookings',
      };

      res.status(500).json(response);
    }
  }

  getCustomerBookings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { customerId } = req.params;
      const requestingUserId = req.user?.userId;

      if (!requestingUserId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      // Users can only view their own bookings (unless admin in future)
      if (requestingUserId !== customerId) {
        const response: ApiResponse = {
          success: false,
          message: 'Access denied',
        };
        res.status(403).json(response);
        return;
      }

      const query = {
        customerId,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        status: req.query.status as string,
        serviceType: req.query.serviceType as string,
      };

      const result = await bookingService.searchBookings(query);

      // Transform the response to match frontend's PaginatedResponse structure
      const response = {
        success: true,
        data: result.bookings,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          pages: Math.ceil(result.total / result.limit)
        }
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in getCustomerBookings controller:', error);

      const response: ApiResponse = {
        success: false,
        message: 'Failed to retrieve customer bookings',
      };

      res.status(500).json(response);
    }
  }

  getProviderBookings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { providerId } = req.params;
      const requestingUserId = req.user?.userId;

      if (!requestingUserId) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      // For now, we'll assume the providerId is the user ID
      // In a real implementation, you'd need to get the provider record first
      if (requestingUserId !== providerId) {
        const response: ApiResponse = {
          success: false,
          message: 'Access denied',
        };
        res.status(403).json(response);
        return;
      }

      const query = {
        providerId,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        status: req.query.status as string,
        serviceType: req.query.serviceType as string,
      };

      const result = await bookingService.searchBookings(query);

      // Transform the response to match frontend's PaginatedResponse structure
      const response = {
        success: true,
        data: result.bookings,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          pages: Math.ceil(result.total / result.limit)
        }
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in getProviderBookings controller:', error);

      const response: ApiResponse = {
        success: false,
        message: 'Failed to retrieve provider bookings',
      };

      res.status(500).json(response);
    }
  }

  cancelBooking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { bookingId } = req.params;
      const userId = req.user?.userId;
      const userType = req.user?.userType;

      if (!userId || !userType) {
        const response: ApiResponse = {
          success: false,
          message: 'User authentication required',
        };
        res.status(401).json(response);
        return;
      }

      const cancelledBooking = await bookingService.cancelBooking(
        bookingId,
        userId,
        userType as 'customer' | 'provider'
      );

      const response: ApiResponse = {
        success: true,
        message: 'Booking cancelled successfully',
        data: { booking: cancelledBooking },
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in cancelBooking controller:', error);

      let message = 'Failed to cancel booking';
      let statusCode = 500;

      if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('access denied')) {
          statusCode = 404;
          message = error.message;
        } else if (error.message.includes('Cannot cancel') || error.message.includes('Access denied')) {
          statusCode = 403;
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

  getMyProviderBookings = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const { page = 1, limit = 50, status } = req.query;

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

      // Build query
      const query: any = {
        providerId: provider.id,
        page: Number(page),
        limit: Number(limit),
      };

      if (status) {
        query.status = status as string;
      }

      const result = await bookingService.searchBookings(query);

      // Transform the response to match frontend's PaginatedResponse structure
      const response = {
        success: true,
        data: result.bookings,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          pages: Math.ceil(result.total / result.limit)
        }
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error in getMyProviderBookings:', error);

      const response: ApiResponse = {
        success: false,
        message: 'Failed to fetch bookings',
      };

      res.status(500).json(response);
    }
  }
}

export default new BookingController();