import { Request, Response } from 'express';
import { IsNull, Not } from 'typeorm';
import { AppDataSource } from '@/config/database';
import { User, UserType } from '@/models/User';
import { Provider } from '@/models/Provider';
import { QuoteRequest } from '@/models/QuoteRequest';
import { Booking, BookingStatus } from '@/models/Booking';
import { Review } from '@/models/Review';
import { Payment } from '@/models/Payment';
import { AppSettings } from '@/models/AppSettings';
import { getStripeInstance, getStripeErrorMessage } from '@/config/stripe';
import notificationService from '@/services/NotificationService';
import serviceCategoryService from '@/services/ServiceCategoryService';
import { NotificationType } from '@/models/Notification';
import logger from '@/config/logger';
import { AuthenticatedRequest } from '@/types';
import { t } from '@/i18n';

export class AdminController {
  // GET /api/admin/dashboard - Admin dashboard overview (FR-076)
  getDashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userRepository = AppDataSource.getRepository(User);
      const providerRepository = AppDataSource.getRepository(Provider);
      const bookingRepository = AppDataSource.getRepository(Booking);
      const reviewRepository = AppDataSource.getRepository(Review);
      const paymentRepository = AppDataSource.getRepository(Payment);

      // Get platform statistics
      const [
        totalUsers,
        totalProviders,
        totalBookings,
        totalReviews,
        revenueRaw,
        pendingProviders,
        activeBookings,
        flaggedReviews,
        ratingRaw
      ] = await Promise.all([
        userRepository.count({ where: { isActive: true } }),
        providerRepository.count({ where: { isActive: true } }),
        bookingRepository.count(),
        reviewRepository.count({ where: { isFlagged: false } }),
        paymentRepository
          .createQueryBuilder('payment')
          .select('SUM(CASE WHEN payment.status = \'succeeded\' THEN payment.platformFee ELSE 0 END)', 'total')
          .select('SUM(CASE WHEN payment.status = \'succeeded\' THEN CAST(payment.amount AS float) ELSE 0 END)', 'gross')
          .addSelect('SUM(CASE WHEN payment.status IN (\'refunded\', \'partially_refunded\') THEN CAST(payment.refundAmount AS float) ELSE 0 END)', 'refunds')
          .getRawOne(),
        providerRepository.count({ where: { verifiedAt: IsNull() } }),
        bookingRepository.count({ where: { status: BookingStatus.IN_PROGRESS } }),
        reviewRepository.count({ where: { isFlagged: true } }),
        reviewRepository
          .createQueryBuilder('review')
          .select('AVG(review.rating)', 'avg')
          .addSelect('COUNT(*)', 'count')
          .where('review.isFlagged = false')
          .getRawOne()
      ]);

      const totalRevenue = parseFloat(revenueRaw?.gross) || 0;
      const totalRefunds = parseFloat(revenueRaw?.refunds) || 0;
      const netRevenue = totalRevenue - totalRefunds;
      const averageRating = parseFloat(ratingRaw?.avg) || null;

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
            totalRefunds,
            netRevenue,
            pendingProviders,
            activeBookings,
            flaggedReviews,
            averageRating: averageRating != null ? Number(averageRating.toFixed(1)) : null
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

      const userRepository = AppDataSource.getRepository(User);
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
      const { isActive, suspensionReason, suspensionComment, suspendedUntil } = req.body;

      // Prevent admin from deactivating their own account
      if (id === req.user?.userId) {
        res.status(400).json({
          success: false,
          error: t(req, 'admin.cannot_suspend_self')
        });
        return;
      }

      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({ where: { id } });

      if (!user) {
        res.status(404).json({
          success: false,
          error: t(req, 'admin.user_not_found')
        });
        return;
      }

      user.isActive = isActive;

      if (!isActive) {
        // Suspending: record reason, comment, optional expiry
        user.suspensionReason = suspensionReason || null;
        user.suspensionComment = suspensionComment || null;
        user.suspendedUntil = suspendedUntil ? new Date(suspendedUntil) : null;
      } else {
        // Reactivating: clear suspension fields
        user.suspensionReason = null;
        user.suspensionComment = null;
        user.suspendedUntil = null;
      }

      await userRepository.save(user);

      // When suspending a PROVIDER, cancel their still-actionable bookings and notify
      // the affected customers — otherwise those bookings silently strand (the provider
      // can no longer accept/start them). We only touch PRE-escrow states (pending,
      // confirmed): in_progress / pending_completion / in_dispute carry a Stripe hold and
      // must be unwound via the refund/dispute flow, so we leave them for admin handling.
      let cancelledCount = 0;
      if (!isActive && user.userType === UserType.PROVIDER) {
        const provider = await AppDataSource.getRepository(Provider).findOne({ where: { userId: id } });
        if (provider) {
          const bookingRepository = AppDataSource.getRepository(Booking);
          const affected = await bookingRepository.find({
            where: [
              { providerId: provider.id, status: BookingStatus.PENDING },
              { providerId: provider.id, status: BookingStatus.CONFIRMED },
            ],
          });
          for (const booking of affected) {
            booking.status = BookingStatus.CANCELLED;
            booking.cancelledAt = new Date();
            booking.cancellationReason = 'Provider suspended by admin';
            await bookingRepository.save(booking);
            cancelledCount++;
            if (booking.customerId) {
              await notificationService.createNotification(booking.customerId, {
                type: NotificationType.BOOKING,
                title: t(req, 'admin.booking_cancelled_title'),
                message: t(req, 'admin.booking_cancelled_msg', { service: booking.serviceType }),
                titleKey: 'titles.booking_cancelled',
                messageKey: 'body.booking_cancelled_admin',
                i18nParams: { service: booking.serviceType },
                actionUrl: `/bookings/${booking.id}`,
                metadata: { bookingId: booking.id },
              }).catch(() => {});
            }
          }
        }
      }

      res.json({
        success: true,
        data: user,
        message: t(req, isActive ? 'admin.user_activated' : 'admin.user_suspended'),
        ...(cancelledCount > 0 ? { cancelledBookings: cancelledCount } : {}),
      });

      logger.info(
        `User ${id} ${isActive ? 'activated' : 'suspended'} by admin ${req.user?.userId}. Reason: ${suspensionReason || 'Not provided'}. Until: ${suspendedUntil || 'permanent'}. Cancelled bookings: ${cancelledCount}`
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

      const providerRepository = AppDataSource.getRepository(Provider);

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

      const providerRepository = AppDataSource.getRepository(Provider);
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

      const reviewRepository = AppDataSource.getRepository(Review);

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

      const reviewRepository = AppDataSource.getRepository(Review);
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

      const userRepository = AppDataSource.getRepository(User);
      const bookingRepository = AppDataSource.getRepository(Booking);
      const paymentRepository = AppDataSource.getRepository(Payment);

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

      // Revenue analytics — daily breakdown
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

      // Revenue summary: gross, refunds, net for the selected period
      const revenueSummaryRaw = await paymentRepository
        .createQueryBuilder('payment')
        .select('SUM(CASE WHEN payment.status = \'succeeded\' THEN CAST(payment.amount AS float) ELSE 0 END)', 'grossRevenue')
        .addSelect('SUM(CASE WHEN payment.status IN (\'refunded\', \'partially_refunded\') THEN CAST(payment.refundAmount AS float) ELSE 0 END)', 'refundedAmount')
        .where('payment.createdAt >= :date', { date: dateFilter })
        .getRawOne();

      const grossRevenue = parseFloat(revenueSummaryRaw?.grossRevenue) || 0;
      const refundedAmount = parseFloat(revenueSummaryRaw?.refundedAmount) || 0;
      const revenueSummary = {
        grossRevenue,
        refundedAmount,
        netRevenue: grossRevenue - refundedAmount,
      };

      res.json({
        success: true,
        data: {
          period,
          userGrowth,
          bookingTrends,
          revenueData,
          revenueSummary
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

  // GET /api/admin/disputes — list IN_DISPUTE bookings (FR-077)
  getDisputes = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20, disputeStatus } = req.query;
      const bookingRepository = AppDataSource.getRepository(Booking);

      // Filter: all disputed bookings (open=still IN_DISPUTE, resolved=moved to cancelled/completed)
      // isDisputed=true is the stable flag; status changes on resolution so can't be used alone.
      const whereClause: any = { isDisputed: true };
      if (disputeStatus === 'open') whereClause.status = BookingStatus.IN_DISPUTE;
      else if (disputeStatus === 'resolved') whereClause.disputeStatus = 'resolved';

      const [disputes, total] = await bookingRepository.findAndCount({
        where: whereClause,
        relations: ['customer', 'provider', 'provider.user'],
        order: { disputedAt: 'DESC' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      });

      res.json({
        success: true,
        data: {
          disputes,
          pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
        }
      });

      logger.info(`Admin ${req.user?.userId} fetched disputes (${total} total)`);
    } catch (error) {
      logger.error('Error retrieving disputes:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // PUT /api/admin/disputes/:id/resolve — capture (provider wins) or cancel hold (customer wins)
  // Design note: two clear outcomes map directly to Stripe primitives:
  //   capture  → provider wins → money moves
  //   refund   → customer wins → authorisation cancelled, card never charged
  resolveDispute = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const bookingRepository = AppDataSource.getRepository(Booking);

    try {
      const { id } = req.params;
      const { decision, adminNotes } = req.body; // decision: 'capture' | 'refund'

      if (!['capture', 'refund'].includes(decision)) {
        res.status(400).json({ success: false, error: t(req, 'dispute.invalid_decision') });
        return;
      }

      const booking = await bookingRepository.findOne({
        where: { id, status: BookingStatus.IN_DISPUTE },
        relations: ['customer', 'provider', 'provider.user'],
      });

      if (!booking) {
        res.status(404).json({ success: false, error: t(req, 'dispute.not_found') });
        return;
      }

      if (!booking.stripePaymentIntentId) {
        res.status(400).json({ success: false, error: t(req, 'dispute.no_payment_intent') });
        return;
      }

      // Stripe init AFTER validation + ownership/state checks so that bad-input/404/400
      // paths never depend on Stripe being configured (and never hang in dev when the
      // key is absent — the throw used to escape the try block entirely). Same family as DEF-A1.
      const stripe = getStripeInstance();

      if (decision === 'capture') {
        // Provider wins: capture the held funds
        await stripe.paymentIntents.capture(booking.stripePaymentIntentId);
        booking.status = BookingStatus.COMPLETED;
      } else {
        // Customer wins: cancel the authorisation — card is never charged
        await stripe.paymentIntents.cancel(booking.stripePaymentIntentId);
        booking.status = BookingStatus.CANCELLED;
        booking.cancelledAt = new Date();
        booking.cancellationReason = 'Dispute resolved in customer favour by admin';
      }

      booking.disputeStatus = 'resolved';
      booking.disputeResolution = decision === 'capture' ? 'provider_favor' : 'customer_favor';
      booking.disputeResolvedAt = new Date();
      booking.disputeResolvedBy = req.user?.userId || '';
      booking.adminNotes = adminNotes || null;
      await bookingRepository.save(booking);

      // Notify both parties. title/message stay as the admin's request-locale
      // string (email/fallback); titleKey/messageKey let each recipient's UI
      // render in their own selected language.
      const providerUserId = booking.provider?.userId;
      const title = t(req, 'dispute.resolved_title');
      const msgKey = decision === 'capture' ? 'dispute.resolved_provider_msg' : 'dispute.resolved_customer_msg';
      const msg = t(req, msgKey, { bookingId: id });
      const i18n = {
        titleKey: 'titles.dispute_resolved',
        messageKey: decision === 'capture' ? 'body.dispute_resolved_provider' : 'body.dispute_resolved_customer',
        i18nParams: { bookingId: id },
      };
      if (booking.customerId) {
        await notificationService.createNotification(booking.customerId, { type: NotificationType.BOOKING, title, message: msg, ...i18n, metadata: { bookingId: id } });
      }
      if (providerUserId) {
        await notificationService.createNotification(providerUserId, { type: NotificationType.BOOKING, title, message: msg, ...i18n, metadata: { bookingId: id } });
      }

      res.json({ success: true, message: t(req, decision === 'capture' ? 'dispute.resolved_captured' : 'dispute.resolved_refunded'), data: { booking } });
      logger.info(`Admin ${req.user?.userId} resolved dispute ${id}: ${decision}. Notes: ${adminNotes || 'none'}`);
    } catch (error) {
      logger.error('Error resolving dispute:', error);
      res.status(500).json({ success: false, error: getStripeErrorMessage(error) });
    }
  }
  // GET /admin/settings
  async getSettings(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const settings = await AppDataSource.getRepository(AppSettings).find({ order: { key: 'ASC' } });
      res.json({ success: true, data: settings });
    } catch (error) {
      logger.error('Error fetching settings:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // PUT /admin/settings/:key
  async updateSetting(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { key } = req.params;
      const { value } = req.body;
      if (value === undefined || value === null) {
        res.status(400).json({ success: false, error: 'value is required' });
        return;
      }
      await AppDataSource.getRepository(AppSettings).upsert(
        { key, value: String(value) },
        ['key']
      );
      const updated = await AppDataSource.getRepository(AppSettings).findOne({ where: { key } });
      res.json({ success: true, data: updated });
    } catch (error) {
      logger.error('Error updating setting:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  // GET /admin/quote-requests — inspect who each request reached (broadcast vs
  // targeted providers) and which providers responded. Supports ?search=<id-prefix>.
  getQuoteRequests = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const search = (req.query.search as string || '').trim();
      const qb = AppDataSource.getRepository(QuoteRequest)
        .createQueryBuilder('qr')
        .leftJoinAndSelect('qr.customer', 'customer')
        .leftJoinAndSelect('qr.quotes', 'quotes')
        .leftJoinAndSelect('quotes.provider', 'qprovider')
        .orderBy('qr.createdAt', 'DESC')
        .take(50);
      if (search) {
        qb.andWhere('CAST(qr.id AS text) ILIKE :s', { s: `${search.toLowerCase()}%` });
      }
      const requests = await qb.getMany();

      // Resolve targeted provider ids → business names in one query.
      const targetIds = [...new Set(requests.flatMap(r => r.targetProviderIds || []))];
      const targetProviders = targetIds.length
        ? await AppDataSource.getRepository(Provider).findByIds(targetIds)
        : [];
      const nameById = new Map(targetProviders.map(p => [p.id, p.businessName]));

      // For broadcast requests, compute the ACTUAL audience the same way provider
      // visibility does: active providers whose service categories cover the request's
      // category AND who are within its radius (mirrors QuoteService matching, incl.
      // the safe fallbacks). Lets admins confirm a request reached the right providers.
      const activeProviders = await AppDataSource.getRepository(Provider).find({ where: { isActive: true } });
      const coverage = new Map<string, Set<string>>();
      for (const p of activeProviders) {
        coverage.set(p.id, await serviceCategoryService.coverageFor(p.services || []));
      }
      const hasCoords = (lat: number, lng: number) =>
        Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
      const matchedFor = (r: QuoteRequest) => {
        const reqLat = Number(r.location?.latitude);
        const reqLng = Number(r.location?.longitude);
        const radius = Number(r.searchRadius) || 25;
        return activeProviders.filter(p => {
          const cat = r.category;
          const cov = coverage.get(p.id)!;
          const catOk = !cat || cov.size === 0 || cov.has(cat);
          if (!catOk) return false;
          const pLat = Number(p.location?.latitude);
          const pLng = Number(p.location?.longitude);
          // (0,0)/missing coords → treat as no location → skip the radius filter.
          if (!hasCoords(pLat, pLng) || !hasCoords(reqLat, reqLng)) return true;
          return Math.abs(reqLat - pLat) <= 0.009 * radius && Math.abs(reqLng - pLng) <= 0.009 * radius;
        }).map(p => ({ id: p.id, name: p.businessName }));
      };

      const data = requests.map(r => {
        const isDirect = !!(r.targetProviderIds && r.targetProviderIds.length);
        const matched = isDirect ? null : matchedFor(r);
        return {
          id: r.id,
          serviceType: r.serviceType,
          category: r.category,
          status: r.status,
          city: r.location?.city || null,
          createdAt: r.createdAt,
          quotesReceived: r.quotesReceived,
          customer: r.customer
            ? { name: `${r.customer.firstName} ${r.customer.lastName}`.trim(), email: r.customer.email }
            : null,
          targeting: isDirect ? 'direct' : 'broadcast',
          targetProviders: (r.targetProviderIds || []).map(id => ({ id, name: nameById.get(id) || id })),
          matchedProviders: matched,         // null for direct; [{id,name}] for broadcast
          matchedCount: matched ? matched.length : null,
          quotes: (r.quotes || []).map(q => ({
            id: q.id,
            provider: q.provider?.businessName || null,
            price: Number(q.estimatedPrice),
            status: q.status,
          })),
        };
      });

      res.json({ success: true, data });
    } catch (error) {
      logger.error('Error fetching admin quote requests:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}

export default new AdminController();