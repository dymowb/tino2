import { Repository } from 'typeorm';
import { AppDataSource } from '@/config/database';
import { Booking, BookingStatus } from '@/models/Booking';
import { User, UserType } from '@/models/User';
import { Provider } from '@/models/Provider';
import logger from '@/config/logger';
import notificationService from '@/services/NotificationService';
import { NotificationType } from '@/models/Notification';

export interface CreateBookingRequest {
  providerId: string;
  serviceType: string;
  description: string;
  location: {
    latitude: number;
    longitude: number;
    address: string;
  };
  scheduledDate: Date;
  estimatedDuration: number;
  specialInstructions?: string;
}

export interface UpdateBookingRequest {
  serviceType?: string;
  description?: string;
  location?: {
    latitude: number;
    longitude: number;
    address: string;
  };
  scheduledDate?: Date;
  estimatedDuration?: number;
  specialInstructions?: string;
}

export interface BookingSearchQuery {
  customerId?: string;
  providerId?: string;
  status?: string;
  serviceType?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
  sortBy?: 'date' | 'status' | 'created';
  sortOrder?: 'asc' | 'desc';
}

export class BookingService {
  private bookingRepository: Repository<Booking>;
  private userRepository: Repository<User>;
  private providerRepository: Repository<Provider>;

  constructor() {
    this.bookingRepository = AppDataSource.getRepository(Booking);
    this.userRepository = AppDataSource.getRepository(User);
    this.providerRepository = AppDataSource.getRepository(Provider);
  }

  async createBooking(customerId: string, bookingData: CreateBookingRequest): Promise<Booking> {
    try {
      // Verify customer exists
      const customer = await this.userRepository.findOne({
        where: { id: customerId, userType: UserType.CUSTOMER },
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      // Verify provider exists and is active
      const provider = await this.providerRepository.findOne({
        where: { id: bookingData.providerId, isActive: true },
        relations: ['user'],
      });

      if (!provider || !provider.user.isActive) {
        throw new Error('Provider not found or inactive');
      }

      // Check for scheduling conflicts
      const conflictingBooking = await this.checkScheduleConflict(
        bookingData.providerId,
        bookingData.scheduledDate,
        bookingData.estimatedDuration
      );

      if (conflictingBooking) {
        throw new Error('Provider is not available at the requested time');
      }

      // Calculate estimated cost (basic calculation - can be enhanced)
      const estimatedCost = this.calculateEstimatedCost(provider, bookingData.estimatedDuration);

      // Create booking
      const booking = this.bookingRepository.create({
        customerId,
        providerId: bookingData.providerId,
        serviceType: bookingData.serviceType,
        description: bookingData.description,
        location: bookingData.location,
        scheduledDate: bookingData.scheduledDate,
        estimatedDuration: bookingData.estimatedDuration,
        totalAmount: estimatedCost,
        status: BookingStatus.PENDING,
        paymentStatus: 'pending' as any,
        specialInstructions: bookingData.specialInstructions,
      });

      const savedBooking = await this.bookingRepository.save(booking) as Booking;
      logger.info(`Booking created`, { bookingId: savedBooking.id, customerId, providerId: bookingData.providerId });

      // Notify provider of new booking request
      notificationService.createNotification(provider.userId, {
        type: NotificationType.BOOKING,
        title: 'New Booking Request',
        message: `${customer.firstName} ${customer.lastName} has requested a booking for ${bookingData.serviceType}`,
        actionUrl: `/bookings?bookingId=${savedBooking.id}`,
        metadata: { bookingId: savedBooking.id },
      }).catch(err => logger.error('Failed to send booking notification:', err));

      return savedBooking;
    } catch (error) {
      logger.error('Error creating booking:', error);
      throw error;
    }
  }

  async getBookingById(bookingId: string, userId?: string): Promise<Booking | null> {
    try {
      const queryBuilder = this.bookingRepository
        .createQueryBuilder('booking')
        .leftJoinAndSelect('booking.customer', 'customer')
        .leftJoinAndSelect('booking.provider', 'provider')
        .leftJoinAndSelect('provider.user', 'providerUser')
        .where('booking.id = :bookingId', { bookingId });

      // If userId is provided, ensure they have access to this booking
      if (userId) {
        queryBuilder.andWhere(
          '(booking.customerId = :userId OR provider.userId = :userId)',
          { userId }
        );
      }

      const booking = await queryBuilder.getOne();
      return booking;
    } catch (error) {
      logger.error('Error fetching booking by ID:', error);
      throw error;
    }
  }

  async updateBooking(bookingId: string, userId: string, updateData: UpdateBookingRequest): Promise<Booking> {
    try {
      const booking = await this.getBookingById(bookingId, userId);

      if (!booking) {
        throw new Error('Booking not found or access denied');
      }

      // Only allow updates if booking is still pending or confirmed
      if (!['pending', 'confirmed'].includes(booking.status)) {
        throw new Error('Cannot update booking in current status');
      }

      // Only customer can update booking details
      if (booking.customerId !== userId) {
        throw new Error('Only the customer can update booking details');
      }

      // Check for scheduling conflicts if date/duration changed
      if (updateData.scheduledDate || updateData.estimatedDuration) {
        const newDate = updateData.scheduledDate || booking.scheduledDate;
        const newDuration = updateData.estimatedDuration || booking.estimatedDuration;

        const conflictingBooking = await this.checkScheduleConflict(
          booking.providerId,
          newDate,
          newDuration,
          bookingId // Exclude current booking from conflict check
        );

        if (conflictingBooking) {
          throw new Error('Provider is not available at the requested time');
        }
      }

      // Update booking fields
      Object.assign(booking, updateData);
      booking.updatedAt = new Date();

      // Recalculate cost if duration changed
      if (updateData.estimatedDuration) {
        const provider = await this.providerRepository.findOne({
          where: { id: booking.providerId },
        });
        if (provider) {
          booking.totalAmount = this.calculateEstimatedCost(provider, updateData.estimatedDuration);
        }
      }

      const updatedBooking = await this.bookingRepository.save(booking);
      logger.info(`Booking updated`, { bookingId, userId });

      return updatedBooking;
    } catch (error) {
      logger.error('Error updating booking:', error);
      throw error;
    }
  }

  async updateBookingStatus(
    bookingId: string, 
    userId: string, 
    newStatus: string, 
    userRole: 'customer' | 'provider'
  ): Promise<Booking> {
    try {
      const booking = await this.getBookingById(bookingId, userId);

      if (!booking) {
        throw new Error('Booking not found or access denied');
      }

      // Validate status transitions
      const isParticipant = booking.customerId === userId || booking.provider?.userId === userId;
      const isValidTransition = this.validateStatusTransition(
        booking.status,
        newStatus,
        userRole,
        isParticipant
      );

      if (!isValidTransition) {
        throw new Error(`Invalid status transition from ${booking.status} to ${newStatus} for ${userRole}`);
      }

      booking.status = newStatus as BookingStatus;
      booking.updatedAt = new Date();

      // Set completion date if booking is completed
      if (newStatus === 'completed') {
        booking.completedAt = new Date();
      }

      const updatedBooking = await this.bookingRepository.save(booking);
      logger.info(`Booking status updated`, { bookingId, newStatus, userId, userRole });

      // Notify the other party about the status change
      const notifyUserId = userRole === 'provider'
        ? updatedBooking.customerId
        : updatedBooking.provider?.userId;
      if (notifyUserId) {
        notificationService.createNotification(notifyUserId, {
          type: NotificationType.BOOKING,
          title: 'Booking Status Updated',
          message: `Your booking status has been updated to: ${newStatus}`,
          actionUrl: `/bookings?bookingId=${bookingId}`,
          metadata: { bookingId, newStatus },
        }).catch(err => logger.error('Failed to send status notification:', err));
      }

      return updatedBooking;
    } catch (error) {
      logger.error('Error updating booking status:', error);
      throw error;
    }
  }

  async searchBookings(query: BookingSearchQuery): Promise<{
    bookings: Booking[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      const {
        customerId,
        providerId,
        status,
        serviceType,
        dateFrom,
        dateTo,
        page = 1,
        limit = 20,
        sortBy = 'created',
        sortOrder = 'desc',
      } = query;

      let queryBuilder = this.bookingRepository
        .createQueryBuilder('booking')
        .leftJoinAndSelect('booking.customer', 'customer')
        .leftJoinAndSelect('booking.provider', 'provider')
        .leftJoinAndSelect('provider.user', 'providerUser')
        .leftJoinAndSelect('booking.reviews', 'reviews');

      // Filter by customer
      if (customerId) {
        queryBuilder = queryBuilder.andWhere('booking.customerId = :customerId', { customerId });
      }

      // Filter by provider
      if (providerId) {
        queryBuilder = queryBuilder.andWhere('booking.providerId = :providerId', { providerId });
      }

      // Filter by status
      if (status) {
        queryBuilder = queryBuilder.andWhere('booking.status = :status', { status });
      }

      // Filter by service type
      if (serviceType) {
        queryBuilder = queryBuilder.andWhere('booking.serviceType = :serviceType', { serviceType });
      }

      // Filter by date range
      if (dateFrom) {
        queryBuilder = queryBuilder.andWhere('booking.scheduledDate >= :dateFrom', { dateFrom });
      }

      if (dateTo) {
        queryBuilder = queryBuilder.andWhere('booking.scheduledDate <= :dateTo', { dateTo });
      }

      // Apply sorting
      const sortField = sortBy === 'date' ? 'booking.scheduledDate' :
                       sortBy === 'status' ? 'booking.status' :
                       'booking.createdAt';
      
      queryBuilder = queryBuilder.orderBy(sortField, sortOrder.toUpperCase() as 'ASC' | 'DESC');

      // Apply pagination
      const offset = (page - 1) * limit;
      queryBuilder = queryBuilder.skip(offset).take(limit);

      const [bookings, total] = await queryBuilder.getManyAndCount();

      logger.info(`Booking search completed`, {
        total,
        page,
        limit,
        filters: { customerId, providerId, status, serviceType },
      });

      return {
        bookings,
        total,
        page,
        limit,
      };
    } catch (error) {
      logger.error('Error searching bookings:', error);
      throw error;
    }
  }

  async cancelBooking(bookingId: string, userId: string, userRole: 'customer' | 'provider'): Promise<Booking> {
    try {
      const booking = await this.getBookingById(bookingId, userId);

      if (!booking) {
        throw new Error('Booking not found or access denied');
      }

      // Check if booking can be cancelled
      if (!['pending', 'confirmed'].includes(booking.status)) {
        throw new Error('Cannot cancel booking in current status');
      }

      // Check cancellation permissions
      const isCustomer = booking.customerId === userId;
      const isProvider = booking.provider?.userId === userId;

      if (!isCustomer && !isProvider) {
        throw new Error('Access denied');
      }

      booking.status = BookingStatus.CANCELLED;
      booking.updatedAt = new Date();
      booking.cancelledAt = new Date();

      const cancelledBooking = await this.bookingRepository.save(booking);
      logger.info(`Booking cancelled`, { bookingId, userId, userRole });

      // Notify the other party
      const notifyUserId = isCustomer ? booking.provider?.userId : booking.customerId;
      if (notifyUserId) {
        notificationService.createNotification(notifyUserId, {
          type: NotificationType.BOOKING,
          title: 'Booking Cancelled',
          message: `A booking has been cancelled by the ${isCustomer ? 'customer' : 'provider'}.`,
          actionUrl: `/bookings?bookingId=${bookingId}`,
          metadata: { bookingId },
        }).catch(err => logger.error('Failed to send cancellation notification:', err));
      }

      return cancelledBooking;
    } catch (error) {
      logger.error('Error cancelling booking:', error);
      throw error;
    }
  }

  private async checkScheduleConflict(
    providerId: string,
    scheduledDate: Date,
    duration: number,
    excludeBookingId?: string
  ): Promise<Booking | null> {
    const startTime = new Date(scheduledDate);
    const endTime = new Date(scheduledDate.getTime() + duration * 60 * 1000);

    let queryBuilder = this.bookingRepository
      .createQueryBuilder('booking')
      .where('booking.providerId = :providerId', { providerId })
      .andWhere('booking.status IN (:...activeStatuses)', { 
        activeStatuses: ['pending', 'confirmed', 'in_progress'] 
      })
      .andWhere(
        '(booking.scheduledDate < :endTime AND booking.scheduledDate + (booking.estimatedDuration * interval \'1 minute\') > :startTime)',
        { startTime, endTime }
      );

    if (excludeBookingId) {
      queryBuilder = queryBuilder.andWhere('booking.id != :excludeBookingId', { excludeBookingId });
    }

    return queryBuilder.getOne();
  }

  private calculateEstimatedCost(provider: Provider, duration: number): number {
    // Basic cost calculation based on provider's base rate
    // This can be enhanced with more complex pricing logic
    const baseRate = provider.pricing?.baseRate || 0;
    const rateType = provider.pricing?.rateType || 'hourly';

    switch (rateType) {
      case 'hourly':
        return (duration / 60) * baseRate;
      case 'fixed':
        return baseRate;
      case 'quote':
        return 0; // Will be set when provider provides quote
      default:
        return duration * 0.5; // Fallback rate
    }
  }

  private validateStatusTransition(
    currentStatus: string,
    newStatus: string,
    userRole: 'customer' | 'provider',
    isOwner: boolean
  ): boolean {
    // Define valid status transitions
    const transitions: Record<string, Record<string, string[]>> = {
      pending: {
        customer: ['cancelled'],
        provider: ['confirmed', 'cancelled'],
      },
      confirmed: {
        customer: ['cancelled'],
        provider: ['in_progress', 'cancelled'],
      },
      in_progress: {
        // provider marks complete via /complete endpoint; kept here for state machine completeness
        customer: [],
        provider: ['pending_completion', 'cancelled'],
      },
      pending_completion: {
        // customer confirms via /confirm-completion or disputes via /dispute endpoint
        customer: ['in_dispute'],
        provider: [],
      },
      in_dispute: {
        customer: [],
        provider: [],
      },
      completed: {
        customer: [],
        provider: [],
      },
      cancelled: {
        customer: [],
        provider: [],
      },
    };

    if (!isOwner) {
      return false; // Only booking participants can change status
    }

    return transitions[currentStatus]?.[userRole]?.includes(newStatus) || false;
  }
}

export default new BookingService();