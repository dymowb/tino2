import { Request, Response } from 'express';
import { getRepository, IsNull, Not } from 'typeorm';
import { User, UserType } from '@/models/User';
import { Provider } from '@/models/Provider';
import { Booking, BookingStatus } from '@/models/Booking';
import { Review } from '@/models/Review';
import { Payment } from '@/models/Payment';
import logger from '@/config/logger';
import { AuthenticatedRequest } from '@/types';

export class AdminController {
  // GET /api/admin/dashboard - Admin dashboard overview (FR-076)
  getDashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userRepository = getRepository(User);
      const providerRepository = getRepository(Provider);
      const bookingRepository = getRepository(Booking);
      const reviewRepository = getRepository(Review);
      const paymentRepository = getRepository(Payment);

      // Get platform statistics
      const [
        totalUsers,
        totalProviders,
        totalBookings,
        totalReviews,
        totalRevenue,
        pendingProviders,
        activeBookings,
        flaggedReviews
      ] = await Promise.all([
        userRepository.count({ where: { isActive: true } }),
        providerRepository.count({ where: { verifiedAt: Not(IsNull()) } }),
        bookingRepository.count(),
        reviewRepository.count({ where: { isFlagged: false } }),
        paymentRepository
          .createQueryBuilder('payment')
          .select('SUM(payment.platformFee)', 'total')
          .where('payment.status = :status', { status: 'succeeded' })
          .getRawOne()
          .then(result => parseFloat(result.total) || 0),
        providerRepository.count({ where: { verifiedAt: IsNull() } }),
        bookingRepository.count({ where: { status: BookingStatus.IN_PROGRESS } }),
        reviewRepository.count({ where: { isFlagged: true } })
      ]);

      // Get recent activities
      const recentUsers = await userRepository.find({
        order: { createdAt: 'DESC' },
        take: 5
      });

      const recentBookings = await bookingRepository.find({
        relations: ['customer', 'provider'],
        order: { createdAt: 'DESC' },
        take: 5
      });

      res.json({
        success: true,
        data: {
          statistics: {
            totalUsers,
            totalProviders,
            totalBookings,
            totalReviews,
            totalRevenue,
            pendingProviders,
            activeBookings,
            flaggedReviews
          },
          recentActivities: {
            users: recentUsers,
            bookings: recentBookings
          }
        }
      });

      logger.info(`Admin dashboard accessed by ${req.user?.userId}`);
    } catch (error) {
      logger.error('Error retrieving admin dashboard:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // GET /api/admin/users - Manage users (FR-074)
  getUsers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { 
        page = 1, 
        limit = 20, 
        userType, 
        isActive, 
        search 
      } = req.query;

      const userRepository = getRepository(User);
      const queryBuilder = userRepository.createQueryBuilder('user');

      // Apply filters
      if (userType) {
        queryBuilder.andWhere('user.userType = :userType', { userType });
      }
      if (isActive !== undefined) {
        queryBuilder.andWhere('user.isActive = :isActive', { 
          isActive: isActive === 'true' 
        });
      }
      if (search) {
        queryBuilder.andWhere(
          '(user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search)',
          { search: `%${search}%` }
        );
      }

      // Pagination
      queryBuilder
        .orderBy('user.createdAt', 'DESC')
        .skip((Number(page) - 1) * Number(limit))
        .take(Number(limit))
;

      const [users, total] = await queryBuilder.getManyAndCount();

      res.json({
        success: true,
        data: {
          users,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });

      logger.info(`Users list accessed by admin ${req.user?.userId}`);
    } catch (error) {
      logger.error('Error retrieving users:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // PUT /api/admin/users/:id/status - Update user status (FR-074)
  updateUserStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { isActive, reason } = req.body;

      const userRepository = getRepository(User);
      const user = await userRepository.findOne({ where: { id } });

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      user.isActive = isActive;
      await userRepository.save(user);

      res.json({
        success: true,
        data: user,
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully`
      });

      logger.info(
        `User ${id} ${isActive ? 'activated' : 'deactivated'} by admin ${req.user?.userId}. Reason: ${reason || 'Not provided'}`
      );
    } catch (error) {
      logger.error('Error updating user status:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // GET /api/admin/providers/pending - Get pending provider verifications (FR-075)
  getPendingProviders = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20 } = req.query;

      const providerRepository = getRepository(Provider);

      const providers = await providerRepository.find({
        where: { verifiedAt: IsNull() },
        relations: ['user'],
        order: { createdAt: 'ASC' }, // Oldest first
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      });

      const total = await providerRepository.count({
        where: { verifiedAt: IsNull() }
      });

      res.json({
        success: true,
        data: {
          providers,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });

      logger.info(`Pending providers list accessed by admin ${req.user?.userId}`);
    } catch (error) {
      logger.error('Error retrieving pending providers:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // POST /api/admin/providers/:id/verify - Verify provider (FR-075)
  verifyProvider = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { 
        approved, 
        notes, 
        isBackgroundChecked, 
        isInsured 
      } = req.body;

      const providerRepository = getRepository(Provider);
      const provider = await providerRepository.findOne({
        where: { id },
        relations: ['user']
      });

      if (!provider) {
        res.status(404).json({
          success: false,
          error: 'Provider not found'
        });
        return;
      }

      if (approved) {
        provider.verifiedAt = new Date();
        provider.verifiedBy = req.user?.userId || '';
        
        if (isBackgroundChecked !== undefined) {
          provider.isBackgroundChecked = isBackgroundChecked;
        }
        if (isInsured !== undefined) {
          provider.isInsured = isInsured;
        }
      } else {
        provider.verifiedAt = null;
        provider.verificationNotes = notes || 'Application rejected';
        provider.rejectedAt = new Date();
        provider.rejectedBy = req.user?.userId || '';
      }

      provider.adminNotes = notes;
      await providerRepository.save(provider);

      res.json({
        success: true,
        data: provider,
        message: `Provider ${approved ? 'approved' : 'rejected'} successfully`
      });

      logger.info(
        `Provider ${id} ${approved ? 'approved' : 'rejected'} by admin ${req.user?.userId}. Notes: ${notes || 'None'}`
      );
    } catch (error) {
      logger.error('Error verifying provider:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // GET /api/admin/reviews/flagged - Get flagged reviews (FR-077, FR-081)
  getFlaggedReviews = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20 } = req.query;

      const reviewRepository = getRepository(Review);

      const reviews = await reviewRepository.find({
        where: { isFlagged: true },
        relations: ['customer', 'provider', 'booking'],
        order: { createdAt: 'DESC' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      });

      const total = await reviewRepository.count({
        where: { isFlagged: true }
      });

      res.json({
        success: true,
        data: {
          reviews,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });

      logger.info(`Flagged reviews accessed by admin ${req.user?.userId}`);
    } catch (error) {
      logger.error('Error retrieving flagged reviews:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // PUT /api/admin/reviews/:id/moderate - Moderate review (FR-081)
  moderateReview = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { action, reason } = req.body; // action: 'approve', 'delete', 'keep_flagged'

      if (!['approve', 'delete', 'keep_flagged'].includes(action)) {
        res.status(400).json({
          success: false,
          error: 'Invalid action. Must be: approve, delete, or keep_flagged'
        });
        return;
      }

      const reviewRepository = getRepository(Review);
      const review = await reviewRepository.findOne({
        where: { id },
        relations: ['customer', 'provider']
      });

      if (!review) {
        res.status(404).json({
          success: false,
          error: 'Review not found'
        });
        return;
      }

      switch (action) {
        case 'approve':
          review.isFlagged = false;
          review.flagReason = null;
          break;
        case 'delete':
          await reviewRepository.remove(review);
          res.json({
            success: true,
            message: 'Review deleted successfully'
          });
          logger.info(`Review ${id} deleted by admin ${req.user?.userId}. Reason: ${reason || 'Not provided'}`);
          return;
        case 'keep_flagged':
          review.flagReason = reason || 'Under review';
          break;
      }

      await reviewRepository.save(review);

      res.json({
        success: true,
        data: review,
        message: `Review ${action === 'approve' ? 'approved' : 'kept flagged'} successfully`
      });

      logger.info(
        `Review ${id} ${action} by admin ${req.user?.userId}. Reason: ${reason || 'Not provided'}`
      );
    } catch (error) {
      logger.error('Error moderating review:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // GET /api/admin/analytics - Platform analytics (FR-076)
  getAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { period = '30d' } = req.query; // 30d, 90d, 1y
      
      let dateFilter: Date;
      switch (period) {
        case '90d':
          dateFilter = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '1y':
          dateFilter = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          dateFilter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      }

      const userRepository = getRepository(User);
      const bookingRepository = getRepository(Booking);
      const paymentRepository = getRepository(Payment);

      // User growth
      const userGrowth = await userRepository
        .createQueryBuilder('user')
        .select('DATE(user.createdAt)', 'date')
        .addSelect('COUNT(*)', 'count')
        .where('user.createdAt >= :date', { date: dateFilter })
        .groupBy('DATE(user.createdAt)')
        .orderBy('date', 'ASC')
        .getRawMany();

      // Booking trends
      const bookingTrends = await bookingRepository
        .createQueryBuilder('booking')
        .select('DATE(booking.createdAt)', 'date')
        .addSelect('COUNT(*)', 'count')
        .addSelect('booking.status', 'status')
        .where('booking.createdAt >= :date', { date: dateFilter })
        .groupBy('DATE(booking.createdAt), booking.status')
        .orderBy('date', 'ASC')
        .getRawMany();

      // Revenue analytics
      const revenueData = await paymentRepository
        .createQueryBuilder('payment')
        .select('DATE(payment.createdAt)', 'date')
        .addSelect('SUM(payment.amount)', 'totalAmount')
        .addSelect('SUM(payment.platformFee)', 'platformFee')
        .addSelect('COUNT(*)', 'transactionCount')
        .where('payment.createdAt >= :date', { date: dateFilter })
        .andWhere('payment.status = :status', { status: 'succeeded' })
        .groupBy('DATE(payment.createdAt)')
        .orderBy('date', 'ASC')
        .getRawMany();

      res.json({
        success: true,
        data: {
          period,
          userGrowth,
          bookingTrends,
          revenueData
        }
      });

      logger.info(`Analytics accessed by admin ${req.user?.userId} for period ${period}`);
    } catch (error) {
      logger.error('Error retrieving analytics:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // GET /api/admin/disputes - Handle disputes (FR-077)
  getDisputes = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20, status } = req.query;

      const bookingRepository = getRepository(Booking);
      
      let whereClause = { isDisputed: true };
      if (status) {
        whereClause = { ...whereClause, disputeStatus: status };
      }

      const disputes = await bookingRepository.find({
        where: whereClause,
        relations: ['customer', 'provider', 'payments'],
        order: { disputedAt: 'DESC' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      });

      const total = await bookingRepository.count({ where: whereClause });

      res.json({
        success: true,
        data: {
          disputes,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });

      logger.info(`Disputes accessed by admin ${req.user?.userId}`);
    } catch (error) {
      logger.error('Error retrieving disputes:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // PUT /api/admin/disputes/:id/resolve - Resolve dispute (FR-077)
  resolveDispute = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { resolution, refundAmount, notes } = req.body;

      if (!['customer_favor', 'provider_favor', 'partial_refund', 'no_action'].includes(resolution)) {
        res.status(400).json({
          success: false,
          error: 'Invalid resolution type'
        });
        return;
      }

      const bookingRepository = getRepository(Booking);
      const booking = await bookingRepository.findOne({
        where: { id, isDisputed: true },
        relations: ['payments']
      });

      if (!booking) {
        res.status(404).json({
          success: false,
          error: 'Disputed booking not found'
        });
        return;
      }

      // Update dispute status
      booking.disputeStatus = 'resolved';
      booking.disputeResolution = resolution;
      booking.disputeResolvedAt = new Date();
      booking.disputeResolvedBy = req.user?.userId || '';
      booking.adminNotes = notes;

      // Handle refunds if needed
      if (resolution === 'customer_favor' || resolution === 'partial_refund') {
        // Process refund logic here
        // This would integrate with the payment system
      }

      await bookingRepository.save(booking);

      res.json({
        success: true,
        data: booking,
        message: 'Dispute resolved successfully'
      });

      logger.info(
        `Dispute ${id} resolved by admin ${req.user?.userId}. Resolution: ${resolution}. Notes: ${notes || 'None'}`
      );
    } catch (error) {
      logger.error('Error resolving dispute:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
}

export default new AdminController();