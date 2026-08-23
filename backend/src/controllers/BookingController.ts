import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import bookingService from '@/services/BookingService';
import providerService from '@/services/ProviderService';
import logger from '@/config/logger';
import { ApiResponse, AuthenticatedRequest } from '@/types';
import { AppDataSource } from '@/config/database';
import { Booking, BookingStatus, PaymentStatus } from '@/models/Booking';
import { User } from '@/models/User';
import { Provider } from '@/models/Provider';
import { getStripeInstance, getStripeErrorMessage, calculateFees } from '@/config/stripe';
import notificationService from '@/services/NotificationService';
import { NotificationType } from '@/models/Notification';
import { t } from '@/i18n';
import quoteService from '@/services/QuoteService';
import serviceCategoryService from '@/services/ServiceCategoryService';
import rebookRefinementService from '@/services/RebookRefinementService';
import { toStripeMinorUnits } from '@/utils/money';
import { getPlatformCurrency } from '@/services/PlatformSettingsService';

export class BookingController {
  private async loadRebookSource(bookingId: string, customerId: string) {
    const booking = await bookingService.getBookingById(bookingId, customerId);
    if (!booking || booking.customerId !== customerId) {
      return { eligible: false as const, reason: 'not_booking_customer' as const, booking: null };
    }
    if (booking.status !== BookingStatus.COMPLETED) {
      return { eligible: false as const, reason: 'booking_not_completed' as const, booking };
    }
    if (!booking.provider?.isActive || !booking.provider.user?.isActive) {
      return { eligible: false as const, reason: 'provider_inactive' as const, booking };
    }
    const category = await serviceCategoryService.categorize(booking.serviceType);
    const coverage = await serviceCategoryService.coverageFor(booking.provider.services || []);
    if (category && !coverage.has(category)) {
      return { eligible: false as const, reason: 'service_no_longer_offered' as const, booking };
    }
    return { eligible: true as const, reason: null, booking };
  }

  getRebookPrefill = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const result = await this.loadRebookSource(req.params.bookingId, req.user!.userId);
    if (!result.booking) {
      res.status(404).json({ success: false, reason: result.reason });
      return;
    }
    const booking = result.booking;
    res.status(200).json({
      success: true,
      data: {
        eligible: result.eligible,
        reason: result.reason,
        sourceBookingId: booking.id,
        provider: booking.provider,
        draft: {
          serviceType: booking.serviceType,
          description: booking.description,
          specialInstructions: booking.specialInstructions || '',
          location: booking.location,
          estimatedDurationHours: Math.max(0.5, Number(booking.estimatedDuration) / 60),
          proposedBudget: Number(booking.totalAmount),
          currency: 'BRL',
          requirements: [],
        },
        references: {
          previousTotal: Number(booking.totalAmount),
          currentBaseRate: booking.provider.pricing?.baseRate ?? null,
        },
        copiedFields: [
          'serviceType',
          'description',
          'specialInstructions',
          'location',
          'estimatedDurationHours',
          'proposedBudget',
        ],
      },
    });
  };

  createRebookRequest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const result = await this.loadRebookSource(req.params.bookingId, req.user!.userId);
      if (!result.booking) {
        res.status(404).json({ success: false, reason: result.reason });
        return;
      }
      if (!result.eligible) {
        res.status(409).json({ success: false, reason: result.reason });
        return;
      }
      const hours = Number(req.body.estimatedDurationHours);
      const budget = Number(req.body.proposedBudget);
      const request = await quoteService.createQuoteRequest(req.user!.userId, {
        serviceType: req.body.serviceType,
        description: req.body.specialInstructions
          ? `${req.body.description}\n\n${req.body.specialInstructions}`
          : req.body.description,
        location: req.body.location,
        preferredDate: new Date(req.body.preferredDate),
        budget: { min: budget, max: budget, currency: 'BRL' },
        urgency: 'medium',
        targetProviderIds: [result.booking.providerId],
        sourceBookingId: result.booking.id,
        requirements: [
          ...(Array.isArray(req.body.requirements) ? req.body.requirements : []),
          {
            category: 'proposed_duration_hours',
            requirement: String(hours),
            mandatory: false,
          },
        ],
      });
      res.status(201).json({ success: true, data: { quoteRequest: request } });
    } catch (error) {
      logger.error('Failed to create rebook request:', error);
      res.status(500).json({ success: false, message: 'Failed to create repeat request' });
    }
  };

  refineRebookDraft = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const result = await this.loadRebookSource(req.params.bookingId, req.user!.userId);
      if (!result.eligible) {
        res.status(result.booking ? 409 : 404).json({ success: false, reason: result.reason });
        return;
      }
      const refinement = await rebookRefinementService.refine(
        req.body.draft,
        req.body.changeRequest
      );
      res.status(200).json({ success: true, data: refinement });
    } catch (error) {
      logger.error('Failed to refine rebook draft:', error);
      res.status(502).json({ success: false, message: 'AI refinement is temporarily unavailable' });
    }
  };

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
  };

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
  };

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
        } else if (
          error.message.includes('Cannot update') ||
          error.message.includes('Only the customer')
        ) {
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
  };

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
  };

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
        const providerProfile = await AppDataSource.getRepository(Provider).findOne({
          where: { userId, isActive: true },
        });
        if (providerProfile) {
          query.providerId = providerProfile.id;
        } else {
          // No provider profile — return empty
          res.json({
            success: true,
            data: [],
            pagination: { page: 1, limit: 20, total: 0, pages: 0 },
          });
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
          pages: Math.ceil(result.total / result.limit),
        },
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
  };

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
          pages: Math.ceil(result.total / result.limit),
        },
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
  };

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
          pages: Math.ceil(result.total / result.limit),
        },
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
  };

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
        userType as 'customer' | 'provider',
        req.body?.reason
      );

      const response: ApiResponse = {
        success: true,
        message: t(req, 'booking.cancel_success'),
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
        } else if (
          error.message.includes('Cannot cancel') ||
          error.message.includes('Access denied')
        ) {
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
  };

  // POST /bookings/:bookingId/start — provider starts service; places hold on customer card
  startBooking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const bookingRepo = AppDataSource.getRepository(Booking);
    const userRepo = AppDataSource.getRepository(User);
    const providerRepo = AppDataSource.getRepository(Provider);

    try {
      const { bookingId } = req.params;

      // Verify caller is the provider for this booking
      const providerEntity = await providerRepo.findOne({ where: { userId: req.user.userId } });
      if (!providerEntity) {
        res.status(403).json({ success: false, message: 'Not a provider' });
        return;
      }

      const booking = await bookingRepo.findOne({
        where: { id: bookingId, providerId: providerEntity.id },
        relations: ['customer'],
      });
      if (!booking) {
        res.status(404).json({ success: false, message: 'Booking not found' });
        return;
      }
      if (booking.status !== BookingStatus.CONFIRMED) {
        res
          .status(400)
          .json({ success: false, message: `Cannot start booking in status: ${booking.status}` });
        return;
      }

      const customer = booking.customer;
      if (!customer.stripePaymentMethodId || !customer.stripeCustomerId) {
        res
          .status(400)
          .json({ success: false, message: 'Customer has not set up a payment method' });
        return;
      }

      // Everything that can fail without touching Stripe happens before the claim, and
      // nothing but the Stripe call happens after it. The claim is not reversible from
      // an error path — this handler cannot tell a failure that preceded the request
      // from one that followed it — so anything able to throw between taking it and
      // making the request would strand the booking with no hold in existence.
      // `getStripeInstance()` is the live example: it throws outright when Stripe is
      // unconfigured, which is the ordinary state of a dev environment.
      const stripe = getStripeInstance();
      const platformCurrency = await getPlatformCurrency();
      const fees = calculateFees(Number(booking.totalAmount));

      // The amount authorised, captured here so the write below can prove the booking
      // still costs what Stripe was asked for.
      const authorisedAmount = Number(booking.totalAmount);

      // Claim the right to place the hold before calling Stripe, not after.
      // Read-check-call-save let two concurrent starts both observe `confirmed` and
      // both authorise the customer's card — a provider double-clicking "Start
      // Service" was enough. This UPDATE is the serialization point: exactly one
      // caller takes the claim, and the loser gets 409 without reaching Stripe.
      //
      // The claim is `holdPlacedAt`, deliberately not the booking status. Moving the
      // row to `in_progress` up front would invent a state the rest of the system does
      // not expect — `markBookingComplete` gates on that status alone, so a booking
      // could be completed, and then confirmed for capture, with no hold behind it.
      // `in_progress` means "work started *and* funds held", and it still does.
      //
      // The claim does not expire. An attempt that dies mid-flight leaves the booking
      // stuck rather than retryable, and that is the intended trade: any automatic
      // takeover has to answer "did the first attempt place a hold?", and every way of
      // answering it from here is a guess about money. A stuck booking is visible and
      // fixable; a wrong guess authorises a customer's card twice.
      //
      // Wrapped in a CTE deliberately: `query()` on a bare UPDATE returns
      // [rows, rowCount], so `claimed.length` would read the wrong thing.
      // Returned as text, not as a timestamp: `holdPlacedAt` is `timestamp without time
      // zone`, and a Date handed back to the driver is re-serialised against the node
      // process's clock rather than the database's.
      const claimed: Array<{ claim_stamp: string }> = await bookingRepo.query(
        `WITH claim AS (
           UPDATE bookings
              SET "holdPlacedAt" = NOW()
            WHERE id = $1
              AND "providerId" = $2
              AND status = $3
              AND "stripePaymentIntentId" IS NULL
              AND "holdPlacedAt" IS NULL
            RETURNING "holdPlacedAt"::text AS claim_stamp
         )
         SELECT claim_stamp FROM claim`,
        [bookingId, providerEntity.id, BookingStatus.CONFIRMED]
      );
      if (claimed.length === 0) {
        res.status(409).json({
          success: false,
          message: 'A payment hold for this booking is already being placed',
        });
        return;
      }
      const claimStamp = claimed[0].claim_stamp;

      // Create PaymentIntent with manual capture = escrow hold. The interesting design
      // decision: we don't charge yet — capture_method:'manual' authorises the funds
      // (freezes them on the card) without moving money.
      let paymentIntent: any;
      try {
        paymentIntent = await stripe.paymentIntents.create(
          {
            // Every price in this product is quoted in BRL (the UI renders R$, and quote
            // requests store BRL budgets). This previously said 'usd', so a R$148 booking
            // authorised $148 — roughly a 5x overcharge on the live escrow path.
            amount: toStripeMinorUnits(authorisedAmount, platformCurrency),
            currency: platformCurrency.toLowerCase(),
            customer: customer.stripeCustomerId,
            payment_method: customer.stripePaymentMethodId,
            capture_method: 'manual',
            confirm: true,
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
            metadata: { bookingId, customerId: customer.id, providerId: providerEntity.id },
            description: `Hold for booking ${bookingId}`,
          },
          // Keyed on the claim, not on the booking. Cross-request duplicates are already
          // impossible — the claim admits one caller — so all this needs to cover is the
          // SDK retrying a single call internally, which one attempt's key does exactly.
          //
          // A key fixed per booking was actively wrong here. When the write below
          // releases a hold and invites a retry, that retry is a genuinely different
          // request: Stripe rejects a repeated key carrying changed parameters, and
          // accepts one carrying identical parameters by replaying the intent it just
          // cancelled — which would be recorded as a hold that holds nothing. A fresh
          // claim means a fresh key, so the retry is simply a new request.
          { idempotencyKey: `booking:${bookingId}:hold:${claimStamp}` }
        );
      } catch (stripeErr: any) {
        // Only a refusal of the card, or Stripe rejecting the request as malformed,
        // proves no hold exists. Anything else — a dropped connection, an API error, a
        // type nobody anticipated — leaves open whether the customer's money is held,
        // and cancelling on those would strand a live authorisation against a cancelled
        // booking. Stating what is definitive rather than what is uncertain keeps an
        // unrecognised error from ending a booking by default.
        const definitive =
          stripeErr?.type === 'StripeCardError' || stripeErr?.type === 'StripeInvalidRequestError';

        if (!definitive) {
          // The claim stays. This booking cannot be started again without someone
          // looking at it, which is the deliberate cost of never guessing about a hold
          // that may exist.
          // This is the only record that a hold may exist, so it carries what is needed
          // to find one: the key the request actually used, and the metadata every
          // intent from this handler is tagged with. A wrong key here is worse than no
          // alert — it invites the conclusion that nothing was created.
          logger.error('Indeterminate Stripe hold — booking needs reconciliation', {
            bookingId,
            idempotencyKey: `booking:${bookingId}:hold:${claimStamp}`,
            searchIntentsBy: { 'metadata.bookingId': bookingId },
            type: stripeErr?.type,
            message: stripeErr?.message,
          });
          res.status(503).json({
            success: false,
            message: 'Could not confirm the payment hold. Support has been notified.',
          });
          return;
        }

        // Hold definitively refused — release the claim, cancel the booking, notify both
        booking.status = BookingStatus.CANCELLED;
        booking.cancelledAt = new Date();
        booking.cancellationReason =
          'Payment hold failed: ' + (stripeErr.message || 'insufficient funds');
        await bookingRepo.query(
          `UPDATE bookings
              SET status = $2,
                  "cancelledAt" = NOW(),
                  "cancellationReason" = $3,
                  "holdPlacedAt" = NULL
            WHERE id = $1`,
          [bookingId, BookingStatus.CANCELLED, booking.cancellationReason]
        );

        notificationService
          .createNotification(customer.id, {
            type: NotificationType.PAYMENT,
            title: 'Payment hold failed',
            message:
              'Your booking was cancelled because the payment could not be authorised. Please update your payment method.',
            titleKey: 'titles.payment_hold_failed',
            messageKey: 'body.payment_hold_failed',
            actionUrl: `/bookings?bookingId=${bookingId}`,
            metadata: { bookingId },
          })
          .catch(() => {});

        notificationService
          .createNotification(req.user.userId, {
            type: NotificationType.PAYMENT,
            title: 'Booking cancelled',
            message:
              "The booking was cancelled because the customer's payment method was declined.",
            titleKey: 'titles.booking_cancelled',
            messageKey: 'body.booking_cancelled_payment',
            actionUrl: `/bookings?bookingId=${bookingId}`,
            metadata: { bookingId },
          })
          .catch(() => {});

        res.status(402).json({
          success: false,
          message: 'Payment hold failed — booking cancelled',
          error: stripeErr.message,
        });
        return;
      }

      // Only now does the booking become `in_progress`, in the same statement that
      // records the intent id, so the state meaning "work started and funds held"
      // never exists without the hold behind it.
      //
      // The amount is a condition, not just a value. A `confirmed` booking can still be
      // edited, and changing its duration recalculates `totalAmount`, so an edit landing
      // while Stripe was answering would leave a hold for the old price against a
      // booking that now costs something else — and capture would take the wrong amount.
      // The row is only written if it still costs what was actually authorised.
      const startWrite: Array<{ id: string }> = await bookingRepo.query(
        `WITH start AS (
           UPDATE bookings
              SET status = $2,
                  "startedAt" = NOW(),
                  "stripePaymentIntentId" = $3
            WHERE id = $1
              AND status = $4
              AND "stripePaymentIntentId" IS NULL
              AND "totalAmount" = $5
            RETURNING id
         )
         SELECT id FROM start`,
        [
          bookingId,
          BookingStatus.IN_PROGRESS,
          paymentIntent.id,
          BookingStatus.CONFIRMED,
          authorisedAmount,
        ]
      );

      if (startWrite.length === 0) {
        // The booking changed underneath this hold. Nothing references the
        // authorisation, so it is released rather than left against the customer's card
        // for the week Stripe would otherwise keep it — and the caller is told the
        // truth rather than "service started".
        let releasedAtStripe = false;
        try {
          await stripe.paymentIntents.cancel(paymentIntent.id);
          releasedAtStripe = true;
        } catch (cancelErr) {
          logger.error('Could not release an unreferenced hold — needs reconciliation', {
            bookingId,
            paymentIntentId: paymentIntent.id,
            error: cancelErr,
          });
        }

        if (!releasedAtStripe) {
          // The claim stays. Freeing it here would invite a retry that authorises the
          // card again while this authorisation may still be standing — the original
          // double-hold defect, re-entered through the recovery path. Whether the money
          // is released is not something this request found out, so it does not act as
          // though it did.
          res.status(503).json({
            success: false,
            message: 'Could not release the payment hold. Support has been notified.',
          });
          return;
        }

        // Released, so the booking is safely startable again — and the retry will take a
        // fresh claim, and therefore a fresh idempotency key, rather than colliding with
        // this attempt's.
        await bookingRepo.query(`UPDATE bookings SET "holdPlacedAt" = NULL WHERE id = $1`, [
          bookingId,
        ]);

        logger.error('Booking changed while its hold was being placed — hold released', {
          bookingId,
          paymentIntentId: paymentIntent.id,
          authorisedAmount,
        });
        res.status(409).json({
          success: false,
          message: 'This booking changed while the payment hold was being placed. Please retry.',
        });
        return;
      }

      const started = await bookingRepo.findOne({ where: { id: bookingId } });
      res.json({
        success: true,
        message: 'Service started, payment held',
        data: { booking: started ?? booking },
      });
    } catch (error) {
      logger.error('Error in startBooking:', error);
      res.status(500).json({ success: false, message: getStripeErrorMessage(error) });
    }
  };

  // POST /bookings/:bookingId/complete — provider marks service as done
  markBookingComplete = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const bookingRepo = AppDataSource.getRepository(Booking);
    const providerRepo = AppDataSource.getRepository(Provider);

    try {
      const { bookingId } = req.params;
      const providerEntity = await providerRepo.findOne({ where: { userId: req.user.userId } });
      if (!providerEntity) {
        res.status(403).json({ success: false, message: 'Not a provider' });
        return;
      }

      const booking = await bookingRepo.findOne({
        where: { id: bookingId, providerId: providerEntity.id },
        relations: ['customer'],
      });
      if (!booking) {
        res.status(404).json({ success: false, message: 'Booking not found' });
        return;
      }
      if (booking.status !== BookingStatus.IN_PROGRESS) {
        res.status(400).json({
          success: false,
          message: `Cannot complete booking in status: ${booking.status}`,
        });
        return;
      }

      booking.status = BookingStatus.PENDING_COMPLETION;
      booking.completedAt = new Date();
      await bookingRepo.save(booking);

      notificationService
        .createNotification(booking.customer.id, {
          type: NotificationType.BOOKING,
          title: 'Service complete — please confirm',
          message:
            'Your provider has marked the service as complete. Please confirm or raise a dispute within 3 days.',
          titleKey: 'titles.service_complete_confirm',
          messageKey: 'body.service_complete_confirm',
          actionUrl: `/bookings?bookingId=${bookingId}`,
          metadata: { bookingId },
        })
        .catch(() => {});

      res.json({
        success: true,
        message: 'Booking marked complete, awaiting customer confirmation',
        data: { booking },
      });
    } catch (error) {
      logger.error('Error in markBookingComplete:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  };

  // POST /bookings/:bookingId/confirm-completion — customer confirms, triggers capture
  confirmCompletion = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const bookingRepo = AppDataSource.getRepository(Booking);

    try {
      const { bookingId } = req.params;
      const booking = await bookingRepo.findOne({
        where: { id: bookingId, customerId: req.user.userId },
        relations: ['provider'],
      });
      if (!booking) {
        res.status(404).json({ success: false, message: 'Booking not found' });
        return;
      }
      if (booking.status !== BookingStatus.PENDING_COMPLETION) {
        res
          .status(400)
          .json({ success: false, message: `Cannot confirm booking in status: ${booking.status}` });
        return;
      }

      // Init Stripe only after owner + state checks so IDOR/wrong-state return proper 4xx.
      const stripe = getStripeInstance();
      await stripe.paymentIntents.capture(booking.stripePaymentIntentId);

      booking.status = BookingStatus.COMPLETED;
      booking.paymentStatus = PaymentStatus.PAID;
      await bookingRepo.save(booking);

      notificationService
        .createNotification(booking.provider.userId, {
          type: NotificationType.PAYMENT,
          title: 'Payment released',
          message: 'The customer confirmed service completion. Payment has been captured.',
          titleKey: 'titles.payment_released',
          messageKey: 'body.payment_released',
          actionUrl: `/bookings?bookingId=${bookingId}`,
          metadata: { bookingId },
        })
        .catch(() => {});

      res.json({
        success: true,
        message: 'Completion confirmed, payment captured',
        data: { booking },
      });
    } catch (error) {
      logger.error('Error in confirmCompletion:', error);
      res.status(500).json({ success: false, message: getStripeErrorMessage(error) });
    }
  };

  // POST /bookings/:bookingId/dispute — customer disputes; freezes capture, notifies admin
  disputeBooking = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const bookingRepo = AppDataSource.getRepository(Booking);

    try {
      const { bookingId } = req.params;
      const { reason } = req.body;
      const booking = await bookingRepo.findOne({
        where: { id: bookingId, customerId: req.user.userId },
      });
      if (!booking) {
        res.status(404).json({ success: false, message: t(req, 'booking.not_found') });
        return;
      }
      if (booking.status !== BookingStatus.PENDING_COMPLETION) {
        res.status(400).json({
          success: false,
          message: t(req, 'booking.dispute_wrong_status', { status: booking.status }),
        });
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

      res.json({ success: true, message: t(req, 'booking.dispute_opened'), data: { booking } });
    } catch (error) {
      logger.error('Error in disputeBooking:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  };

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
          pages: Math.ceil(result.total / result.limit),
        },
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
  };
}

export default new BookingController();
