import { Repository } from 'typeorm';
import { AppDataSource } from '@/config/database';
import Stripe from 'stripe';
import { Payment, PaymentStatus, PaymentMethod } from '@/models/Payment';
import { Booking, BookingStatus } from '@/models/Booking';
import { User } from '@/models/User';
import { Provider } from '@/models/Provider';
import logger from '@/config/logger';
import config from '@/config/environment';
import notificationService from '@/services/NotificationService';
import { NotificationType } from '@/models/Notification';

export interface CreatePaymentIntentData {
  bookingId: string;
  customerId: string;
  amount: number;
  currency?: string;
  paymentMethod?: PaymentMethod;
}

export interface PaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
  payment: Payment;
}

export interface RefundData {
  paymentId: string;
  amount?: number;
  reason?: string;
  requestedBy: string;
  requestedByUserType?: string;
}

/**
 * Who the acting user is relative to a payment. `null` means "no relationship" —
 * the caller must be treated as an outsider, not merely unauthorized.
 */
export type PaymentRole = 'admin' | 'customer' | 'provider' | null;

export interface PaymentActor {
  userId: string;
  userType?: string;
}

/** Thrown when a caller has no relationship to the payment they addressed. */
export class PaymentAccessError extends Error {
  constructor(message = 'Unauthorized to access this payment') {
    super(message);
    this.name = 'PaymentAccessError';
  }
}

export interface PaymentSummary {
  totalRevenue: number;
  platformFees: number;
  refundedAmount: number;
  paymentCount: number;
  averagePayment: number;
}

class PaymentService {
  private stripe: Stripe | null = null;
  private paymentRepository: Repository<Payment>;
  private bookingRepository: Repository<Booking>;
  private userRepository: Repository<User>;
  private providerRepository: Repository<Provider>;

  private getStripe(): Stripe {
    if (!this.stripe) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) {
        throw new Error('STRIPE_SECRET_KEY is not configured');
      }
      this.stripe = new Stripe(key, { apiVersion: '2025-08-27.basil' });
    }
    return this.stripe;
  }

  private initRepositories(): void {
    this.paymentRepository = AppDataSource.getRepository(Payment);
    this.bookingRepository = AppDataSource.getRepository(Booking);
    this.userRepository = AppDataSource.getRepository(User);
    this.providerRepository = AppDataSource.getRepository(Provider);
  }

  /**
   * Resolve the acting user's relationship to a payment.
   *
   * `payment.providerId` stores a **Provider entity** UUID, never a User UUID, so the
   * provider comparison has to hop through `Provider.userId`. Comparing the two
   * directly silently fails closed for legitimate providers and is the single most
   * repeated authz bug in this codebase.
   */
  public async resolvePaymentRole(payment: Payment, actor: PaymentActor): Promise<PaymentRole> {
    this.initRepositories();

    if (actor.userType === 'admin') {
      return 'admin';
    }

    if (payment.customerId === actor.userId) {
      return 'customer';
    }

    const providerEntity = await this.providerRepository.findOne({
      where: { userId: actor.userId },
      select: ['id'],
    });
    if (providerEntity && providerEntity.id === payment.providerId) {
      return 'provider';
    }

    return null;
  }

  /**
   * Resolve the Provider entity id for a user, or null when they own no provider profile.
   * Callers building `where` clauses against `payment.providerId` must use this.
   */
  public async resolveProviderEntityId(userId: string): Promise<string | null> {
    this.initRepositories();
    const providerEntity = await this.providerRepository.findOne({
      where: { userId },
      select: ['id'],
    });
    return providerEntity?.id ?? null;
  }

  /**
   * Create payment intent with escrow functionality (FR-057, FR-058, FR-059)
   */
  public async createPaymentIntent(data: CreatePaymentIntentData): Promise<PaymentIntentResult> {
    this.initRepositories();

    try {
      // Validate booking exists and belongs to customer
      const booking = await this.bookingRepository.findOne({
        where: { id: data.bookingId, customerId: data.customerId },
        relations: ['provider', 'customer'],
      });

      if (!booking) {
        throw new Error('Booking not found or unauthorized');
      }

      if (booking.status === BookingStatus.CANCELLED) {
        throw new Error('Cannot create payment for cancelled booking');
      }

      // Check if payment already exists
      const existingPayment = await this.paymentRepository.findOne({
        where: { bookingId: data.bookingId },
      });

      if (existingPayment && existingPayment.status !== PaymentStatus.FAILED) {
        throw new Error('Payment already exists for this booking');
      }

      // Calculate fees (FR-060)
      const platformFeeRate = parseFloat(process.env.PLATFORM_FEE_RATE || '0.05');
      const stripeFeeRate = parseFloat(process.env.STRIPE_FEE_RATE || '0.029');
      const stripeFeeFixed = parseFloat(process.env.STRIPE_FEE_FIXED || '0.30');

      const platformFee = Math.round(data.amount * platformFeeRate * 100) / 100;
      const stripeFee = Math.round((data.amount * stripeFeeRate + stripeFeeFixed) * 100) / 100;
      const providerAmount = Math.round((data.amount - platformFee - stripeFee) * 100) / 100;

      // Get or create Stripe customer
      let stripeCustomerId = booking.customer.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await this.getStripe().customers.create({
          email: booking.customer.email,
          name: `${booking.customer.firstName} ${booking.customer.lastName}`,
          metadata: {
            userId: booking.customer.id,
          },
        });
        stripeCustomerId = customer.id;

        // Update user with Stripe customer ID
        await this.userRepository.update(booking.customerId, {
          stripeCustomerId,
        });
      }

      // Create payment intent with manual capture for escrow (FR-059, FR-061)
      const paymentIntent = await this.getStripe().paymentIntents.create({
        amount: Math.round(data.amount * 100), // Convert to cents
        currency: data.currency || 'usd',
        customer: stripeCustomerId,
        metadata: {
          bookingId: data.bookingId,
          customerId: data.customerId,
          providerId: booking.providerId,
          platformFee: platformFee.toString(),
          stripeFee: stripeFee.toString(),
          providerAmount: providerAmount.toString(),
        },
        capture_method: 'manual', // Hold funds until service completion
        description: `Payment for ${booking.serviceType} booking`,
        receipt_email: booking.customer.email,
      });

      // Create payment record
      const payment = this.paymentRepository.create({
        id: paymentIntent.id,
        bookingId: data.bookingId,
        customerId: data.customerId,
        providerId: booking.providerId,
        amount: data.amount,
        currency: data.currency || 'usd',
        platformFee,
        processingFee: stripeFee,
        providerAmount,
        status: PaymentStatus.PENDING,
        paymentMethod: data.paymentMethod || PaymentMethod.CREDIT_CARD,
        stripePaymentIntentId: paymentIntent.id,
        metadata: {
          requiresCapture: true,
          escrowHold: true,
          stripeCustomerId,
        },
      });

      const savedPayment = await this.paymentRepository.save(payment);

      // Notify provider of incoming payment
      notificationService
        .createNotification(booking.provider.userId, {
          type: NotificationType.PAYMENT,
          title: 'Payment Initiated',
          message: `A payment of $${(data.amount / 100).toFixed(2)} has been initiated for your service`,
          titleKey: 'titles.payment_initiated',
          messageKey: 'body.payment_initiated',
          i18nParams: { amount: `$${(data.amount / 100).toFixed(2)}` },
          actionUrl: `/payments/${savedPayment.id}`,
          metadata: { paymentId: savedPayment.id, bookingId: data.bookingId },
        })
        .catch((err) => logger.error('Failed to send payment notification:', err));

      logger.info(`Payment intent created: ${paymentIntent.id} for booking ${data.bookingId}`);

      return {
        clientSecret: paymentIntent.client_secret!,
        paymentIntentId: paymentIntent.id,
        payment: savedPayment,
      };
    } catch (error) {
      logger.error('Error creating payment intent:', error);
      throw error;
    }
  }

  /**
   * Confirm and capture payment (release from escrow)
   */
  public async confirmPayment(
    paymentId: string,
    userId: string,
    userType?: string
  ): Promise<Payment> {
    this.initRepositories();

    try {
      const payment = await this.paymentRepository.findOne({
        where: { id: paymentId },
        relations: ['booking', 'customer', 'provider'],
      });

      if (!payment) {
        throw new Error('Payment not found');
      }

      // Authorization check. Resolved through resolvePaymentRole because payment.providerId
      // is a Provider entity id — the previous `userId !== payment.providerId` comparison
      // could never match, so providers were locked out of capturing their own payments.
      const role = await this.resolvePaymentRole(payment, { userId, userType });
      if (role === null) {
        throw new PaymentAccessError('Payment not found');
      }

      if (payment.status === PaymentStatus.SUCCEEDED) {
        throw new Error('Payment already confirmed');
      }

      // Capture the payment intent
      const paymentIntent = await this.getStripe().paymentIntents.capture(
        payment.stripePaymentIntentId
      );

      if (paymentIntent.status === 'succeeded') {
        payment.status = PaymentStatus.SUCCEEDED;
        payment.completedAt = new Date();
        payment.paidAt = new Date();

        // Update metadata with charge information (charges removed from PaymentIntent in newer SDK)
        const charge = (paymentIntent as any).charges?.data?.[0];
        if (charge) {
          payment.stripeChargeId = charge.id;
          payment.metadata = {
            ...payment.metadata,
            last4: charge.payment_method_details?.card?.last4,
            cardBrand: charge.payment_method_details?.card?.brand,
            receipt_url: charge.receipt_url || undefined,
          };
        }

        await this.paymentRepository.save(payment);

        // Update booking status to indicate payment is complete
        await this.bookingRepository.update(payment.bookingId, {
          status: BookingStatus.CONFIRMED,
        });

        logger.info(`Payment confirmed and captured: ${paymentId}`);
        return payment;
      } else {
        throw new Error(`Payment confirmation failed: ${paymentIntent.status}`);
      }
    } catch (error) {
      logger.error('Error confirming payment:', error);
      throw error;
    }
  }

  /**
   * Process refund (FR-063)
   */
  public async processRefund(data: RefundData): Promise<Payment> {
    this.initRepositories();

    try {
      const payment = await this.paymentRepository.findOne({
        where: { id: data.paymentId },
        relations: ['booking', 'customer'],
      });

      if (!payment) {
        throw new Error('Payment not found');
      }

      // Authorization (FR-063). Refunds move real money, so this is resolved before any
      // Stripe call and before leaking payment state through error messages.
      //
      // Policy: the assigned provider may refund their own customer (self-harming, so
      // safe), and an admin may refund as dispute resolution. The paying customer may
      // NOT refund themselves — their route to money back is POST /bookings/:id/dispute,
      // which an admin adjudicates. Without this, a captured payment could be reversed
      // unilaterally after the service was delivered.
      const role = await this.resolvePaymentRole(payment, {
        userId: data.requestedBy,
        userType: data.requestedByUserType,
      });

      if (role === null) {
        // Outsider: do not confirm the payment exists.
        throw new PaymentAccessError('Payment not found');
      }

      if (role !== 'admin' && role !== 'provider') {
        throw new PaymentAccessError('Unauthorized to refund this payment');
      }

      if (payment.status === PaymentStatus.REFUNDED) {
        throw new Error('Payment already refunded');
      }

      if (payment.status !== PaymentStatus.SUCCEEDED) {
        throw new Error('Can only refund succeeded payments');
      }

      // Create refund via Stripe
      const refundAmount = data.amount ? Math.round(data.amount * 100) : undefined;
      const refund = await this.getStripe().refunds.create({
        payment_intent: payment.stripePaymentIntentId,
        amount: refundAmount,
        reason: (data.reason as any) || 'requested_by_customer',
        metadata: {
          paymentId: data.paymentId,
          requestedBy: data.requestedBy,
        },
      });

      // Update payment record
      payment.status =
        refundAmount && refundAmount < payment.amount * 100
          ? PaymentStatus.PARTIALLY_REFUNDED
          : PaymentStatus.REFUNDED;
      payment.refundedAt = new Date();
      payment.refundAmount = refund.amount / 100;
      payment.stripeRefundId = refund.id;
      payment.metadata = {
        ...payment.metadata,
        refund_reason: data.reason,
      };

      await this.paymentRepository.save(payment);

      // Update booking status if fully refunded
      if (payment.status === PaymentStatus.REFUNDED) {
        await this.bookingRepository.update(payment.bookingId, {
          status: BookingStatus.CANCELLED,
        });
      }

      logger.info(`Payment refunded: ${data.paymentId}, refund ID: ${refund.id}`);
      return payment;
    } catch (error) {
      logger.error('Error processing refund:', error);
      throw error;
    }
  }

  /**
   * Get payment history with filtering and pagination (FR-064)
   */
  public async getPaymentHistory(
    userId: string,
    userType: 'customer' | 'provider',
    options: {
      page?: number;
      limit?: number;
      status?: PaymentStatus;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ) {
    this.initRepositories();

    const { page = 1, limit = 10, status, startDate, endDate } = options;

    const queryBuilder = this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.booking', 'booking')
      .leftJoinAndSelect('payment.customer', 'customer')
      .leftJoinAndSelect('payment.provider', 'provider');

    // Filter by user type
    if (userType === 'customer') {
      queryBuilder.where('payment.customerId = :userId', { userId });
    } else {
      queryBuilder.where('payment.providerId = :userId', { userId });
    }

    // Apply additional filters
    if (status) {
      queryBuilder.andWhere('payment.status = :status', { status });
    }

    if (startDate) {
      queryBuilder.andWhere('payment.createdAt >= :startDate', { startDate });
    }

    if (endDate) {
      queryBuilder.andWhere('payment.createdAt <= :endDate', { endDate });
    }

    // Apply pagination
    queryBuilder
      .orderBy('payment.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [payments, total] = await queryBuilder.getManyAndCount();

    return {
      payments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get payment analytics and summary (FR-064)
   */
  public async getPaymentSummary(
    userId: string,
    userType: 'customer' | 'provider' | 'admin',
    dateRange?: { startDate: Date; endDate: Date }
  ): Promise<PaymentSummary> {
    this.initRepositories();

    const queryBuilder = this.paymentRepository
      .createQueryBuilder('payment')
      .where('payment.status = :status', { status: PaymentStatus.SUCCEEDED });

    // Filter by user if not admin
    if (userType !== 'admin') {
      if (userType === 'customer') {
        queryBuilder.andWhere('payment.customerId = :userId', { userId });
      } else {
        queryBuilder.andWhere('payment.providerId = :userId', { userId });
      }
    }

    // Apply date range
    if (dateRange) {
      queryBuilder
        .andWhere('payment.completedAt >= :startDate', { startDate: dateRange.startDate })
        .andWhere('payment.completedAt <= :endDate', { endDate: dateRange.endDate });
    }

    const payments = await queryBuilder.getMany();

    // Calculate refunded payments separately
    const refundedPayments = await this.paymentRepository.find({
      where: {
        status: PaymentStatus.REFUNDED,
        ...(userType === 'customer'
          ? { customerId: userId }
          : userType === 'provider'
            ? { providerId: userId }
            : {}),
      },
    });

    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
    const platformFees = payments.reduce((sum, p) => sum + p.platformFee, 0);
    const refundedAmount = refundedPayments.reduce((sum, p) => sum + p.refundAmount, 0);
    const paymentCount = payments.length;
    const averagePayment = paymentCount > 0 ? totalRevenue / paymentCount : 0;

    return {
      totalRevenue,
      platformFees,
      refundedAmount,
      paymentCount,
      averagePayment,
    };
  }

  /**
   * Handle Stripe webhook events (INT-003)
   */
  public async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    this.initRepositories();

    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
          break;

        case 'charge.dispute.created':
          await this.handleDisputeCreated(event.data.object as Stripe.Dispute);
          break;

        default:
          logger.info(`Unhandled webhook event type: ${event.type}`);
      }
    } catch (error) {
      logger.error('Error handling webhook event:', error);
      throw error;
    }
  }

  private async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    await this.paymentRepository.update(
      { stripePaymentIntentId: paymentIntent.id },
      {
        status: PaymentStatus.SUCCEEDED,
        completedAt: new Date(),
        paidAt: new Date(),
      }
    );
    logger.info(`Payment succeeded via webhook: ${paymentIntent.id}`);
  }

  private async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    await this.paymentRepository.update(
      { stripePaymentIntentId: paymentIntent.id },
      {
        status: PaymentStatus.FAILED,
        failedAt: new Date(),
        metadata: {
          failure_reason: paymentIntent.last_payment_error?.message,
        } as any,
      }
    );
    logger.warn(`Payment failed via webhook: ${paymentIntent.id}`);
  }

  private async handleDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
    const payment = await this.paymentRepository.findOne({
      where: { stripeChargeId: dispute.charge as string },
    });

    if (payment) {
      payment.metadata = {
        ...payment.metadata,
        dispute_id: dispute.id,
        dispute_reason: dispute.reason,
        dispute_status: dispute.status,
      };
      await this.paymentRepository.save(payment);
      logger.warn(`Dispute created for payment: ${payment.id}, dispute ID: ${dispute.id}`);
    }
  }

  /**
   * Validate payment data
   */
  public validatePaymentData(data: CreatePaymentIntentData): string[] {
    const errors: string[] = [];

    if (!data.bookingId) {
      errors.push('Booking ID is required');
    }

    if (!data.customerId) {
      errors.push('Customer ID is required');
    }

    if (!data.amount || data.amount <= 0) {
      errors.push('Amount must be greater than 0');
    }

    if (data.amount > 999999.99) {
      errors.push('Amount cannot exceed $999,999.99');
    }

    if (data.currency && !/^[A-Z]{3}$/.test(data.currency)) {
      errors.push('Currency must be a valid 3-letter code');
    }

    return errors;
  }
}

export default new PaymentService();
