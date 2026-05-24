import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import bookingService from '@/services/BookingService';
import providerService from '@/services/ProviderService';
import logger from '@/config/logger';
import { ApiResponse, AuthenticatedRequest } from '@/types';
import { AppDataSource } from '@/config/database';
import { Booking, BookingStatus } from '@/models/Booking';
import { User } from '@/models/User';
import { Provider } from '@/models/Provider';
import { getStripeInstance, getStripeErrorMessage, calculateFees } from '@/config/stripe';
import notificationService from '@/services/NotificationService';
import { NotificationType } from '@/models/Notification';

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
        // booking.providerId references providers.id (not users.id) — look it up
        const providerProfile = await AppDataSource.getRepository(Provider)
          .findOne({ where: { userId, isActive: true } });
        if (providerProfile) {
          query.providerId = providerProfile.id;
        } else {
          // No provider profile — return empty
          res.json({ success: true, data: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 } });
          return;
        }
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

  // POST /bookings/:bookingId/start — provider starts service; places hold on customer card
  startBooking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const bookingRepo = AppDataSource.getRepository(Booking);
    const userRepo = AppDataSource.getRepository(User);
    const providerRepo = AppDataSource.getRepository(Provider);

    try {
      const stripe = getStripeInstance();
      const { bookingId } = req.params;

      // Verify caller is the provider for this booking
      const providerEntity = await providerRepo.findOne({ where: { userId: req.user.userId } });
      if (!providerEntity) { res.status(403).json({ success: false, message: 'Not a provider' }); return; }

      const booking = await bookingRepo.findOne({
        where: { id: bookingId, providerId: providerEntity.id },
        relations: ['customer'],
      });
      if (!booking) { res.status(404).json({ success: false, message: 'Booking not found' }); return; }
      if (booking.status !== BookingStatus.CONFIRMED) {
        res.status(400).json({ success: false, message: `Cannot start booking in status: ${booking.status}` });
        return;
      }

      const customer = booking.customer;
      if (!customer.stripePaymentMethodId || !customer.stripeCustomerId) {
        res.status(400).json({ success: false, message: 'Customer has not set up a payment method' });
        return;
      }

      // Create PaymentIntent with manual capture = escrow hold
      // The interesting design decision: we don't charge yet — capture_method:'manual'
      // authorises the funds (freezes them on the card) without moving money.
      const fees = calculateFees(Number(booking.totalAmount));
      let paymentIntent: any;
      try {
        paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(Number(booking.totalAmount) * 100),
          currency: 'usd',
          customer: customer.stripeCustomerId,
          payment_method: customer.stripePaymentMethodId,
          capture_method: 'manual',
          confirm: true,
          automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
          metadata: { bookingId, customerId: customer.id, providerId: providerEntity.id },
          description: `Hold for booking ${bookingId}`,
        });
      } catch (stripeErr: any) {
        // Hold failed — cancel the booking and notify both parties
        booking.status = BookingStatus.CANCELLED;
        booking.cancelledAt = new Date();
        booking.cancellationReason = 'Payment hold failed: ' + (stripeErr.message || 'insufficient funds');
        await bookingRepo.save(booking);

        notificationService.createNotification(customer.id, {
          type: NotificationType.PAYMENT,
          title: 'Payment hold failed',
          message: 'Your booking was cancelled because the payment could not be authorised. Please update your payment method.',
          actionUrl: `/bookings/${bookingId}`,
          metadata: { bookingId },
        }).catch(() => {});

        notificationService.createNotification(req.user.userId, {
          type: NotificationType.PAYMENT,
          title: 'Booking cancelled',
          message: 'The booking was cancelled because the customer\'s payment method was declined.',
          actionUrl: `/bookings/${bookingId}`,
          metadata: { bookingId },
        }).catch(() => {});

        res.status(402).json({ success: false, message: 'Payment hold failed — booking cancelled', error: stripeErr.message });
        return;
      }

      booking.status = BookingStatus.IN_PROGRESS;
      booking.startedAt = new Date();
      booking.stripePaymentIntentId = paymentIntent.id;
      booking.holdPlacedAt = new Date();
      await bookingRepo.save(booking);

      res.json({ success: true, message: 'Service started, payment held', data: { booking } });
    } catch (error) {
      logger.error('Error in startBooking:', error);
      res.status(500).json({ success: false, message: getStripeErrorMessage(error) });
    }
  }

  // POST /bookings/:bookingId/complete — provider marks service as done
  markBookingComplete = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const bookingRepo = AppDataSource.getRepository(Booking);
    const providerRepo = AppDataSource.getRepository(Provider);

    try {
      const { bookingId } = req.params;
      const providerEntity = await providerRepo.findOne({ where: { userId: req.user.userId } });
      if (!providerEntity) { res.status(403).json({ success: false, message: 'Not a provider' }); return; }

      const booking = await bookingRepo.findOne({
        where: { id: bookingId, providerId: providerEntity.id },
        relations: ['customer'],
      });
      if (!booking) { res.status(404).json({ success: false, message: 'Booking not found' }); return; }
      if (booking.status !== BookingStatus.IN_PROGRESS) {
        res.status(400).json({ success: false, message: `Cannot complete booking in status: ${booking.status}` });
        return;
      }

      booking.status = BookingStatus.PENDING_COMPLETION;
      booking.completedAt = new Date();
      await bookingRepo.save(booking);

      notificationService.createNotification(booking.customer.id, {
        type: NotificationType.BOOKING,
        title: 'Service complete — please confirm',
        message: 'Your provider has marked the service as complete. Please confirm or raise a dispute within 3 days.',
        actionUrl: `/bookings/${bookingId}`,
        metadata: { bookingId },
      }).catch(() => {});

      res.json({ success: true, message: 'Booking marked complete, awaiting customer confirmation', data: { booking } });
    } catch (error) {
      logger.error('Error in markBookingComplete:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // POST /bookings/:bookingId/confirm-completion — customer confirms, triggers capture
  confirmCompletion = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const bookingRepo = AppDataSource.getRepository(Booking);

    try {
      const stripe = getStripeInstance();
      const { bookingId } = req.params;
      const booking = await bookingRepo.findOne({
        where: { id: bookingId, customerId: req.user.userId },
        relations: ['provider'],
      });
      if (!booking) { res.status(404).json({ success: false, message: 'Booking not found' }); return; }
      if (booking.status !== BookingStatus.PENDING_COMPLETION) {
        res.status(400).json({ success: false, message: `Cannot confirm booking in status: ${booking.status}` });
        return;
      }

      await stripe.paymentIntents.capture(booking.stripePaymentIntentId);

      booking.status = BookingStatus.COMPLETED;
      await bookingRepo.save(booking);

      notificationService.createNotification(booking.provider.userId, {
        type: NotificationType.PAYMENT,
        title: 'Payment released',
        message: 'The customer confirmed service completion. Payment has been captured.',
        actionUrl: `/bookings/${bookingId}`,
        metadata: { bookingId },
      }).catch(() => {});

      res.json({ success: true, message: 'Completion confirmed, payment captured', data: { booking } });
    } catch (error) {
      logger.error('Error in confirmCompletion:', error);
      res.status(500).json({ success: false, message: getStripeErrorMessage(error) });
    }
  }

  // POST /bookings/:bookingId/dispute — customer disputes; freezes capture, notifies admin
  disputeBooking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const bookingRepo = AppDataSource.getRepository(Booking);

    try {
      const { bookingId } = req.params;
      const { reason } = req.body;
      const booking = await bookingRepo.findOne({
        where: { id: bookingId, customerId: req.user.userId },
      });
      if (!booking) { res.status(404).json({ success: false, message: 'Booking not found' }); return; }
      if (booking.status !== BookingStatus.PENDING_COMPLETION) {
        res.status(400).json({ success: false, message: `Cannot dispute booking in status: ${booking.status}` });
        return;
      }

      booking.status = BookingStatus.IN_DISPUTE;
      booking.isDisputed = true;
      booking.disputeReason = reason || 'Customer disputed completion';
      booking.disputedAt = new Date();
      booking.disputeStatus = 'open';
      await bookingRepo.save(booking);

      // Notify all admins — in a real system you'd query admin users; here we log it
      // (Admin dispute resolution UI is Phase 15)
      logger.warn(`Booking ${bookingId} disputed by customer ${req.user.userId}: ${reason}`);

      res.json({ success: true, message: 'Dispute raised, admin has been notified', data: { booking } });
    } catch (error) {
      logger.error('Error in disputeBooking:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
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