import { In, LessThan, MoreThan, Repository } from 'typeorm';
import { AppDataSource } from '@/config/database';
import Stripe from 'stripe';
import { Payment, PaymentStatus } from '@/models/Payment';
import { Booking, BookingStatus } from '@/models/Booking';
import { User } from '@/models/User';
import { Provider } from '@/models/Provider';
import { RefundOperation, RefundOperationStatus } from '@/models/RefundOperation';
import logger from '@/config/logger';
import {
  formatMajorUnits,
  fromStripeMinorUnits,
  roundMajorUnits,
  toStripeMinorUnits,
} from '@/utils/money';
import { getPlatformCurrency, getPlatformLocale } from '@/services/PlatformSettingsService';

export interface RefundData {
  paymentId: string;
  amount?: number;
  reason?: string;
  requestedBy: string;
  requestedByUserType?: string;
  idempotencyKey: string;
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

/**
 * Thrown when the request is well-formed and authorized but the payment is not in a
 * state that permits it (already refunded, over-refunded, not yet captured).
 * Typed rather than string-matched — the controller previously classified these by
 * substring, which is how the 400 branch ended up unreachable behind a 403.
 */
export class PaymentStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentStateError';
  }
}

export class RefundIdempotencyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RefundIdempotencyConflictError';
  }
}

export class RefundIndeterminateError extends Error {
  constructor(message = 'Could not confirm the refund. Retry with the same idempotency key.') {
    super(message);
    this.name = 'RefundIndeterminateError';
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
   * Reserve a refund durably before contacting Stripe. The payment row lock makes
   * the refundable balance plus every unresolved reservation one serial decision.
   */
  private async claimRefund(data: RefundData): Promise<{
    operation: RefundOperation;
    payment?: Payment;
  }> {
    return AppDataSource.transaction(async (manager) => {
      const payment = await manager.findOne(Payment, {
        where: { id: data.paymentId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!payment) throw new Error('Payment not found');

      const role = await this.resolvePaymentRole(payment, {
        userId: data.requestedBy,
        userType: data.requestedByUserType,
      });
      if (role === null) throw new PaymentAccessError('Payment not found');
      if (role !== 'admin' && role !== 'provider') {
        throw new PaymentAccessError('Unauthorized to refund this payment');
      }

      const currency = payment.currency || (await getPlatformCurrency());
      if (data.amount !== undefined && !Number.isFinite(data.amount)) {
        throw new PaymentStateError('Refund amount must be a finite number');
      }
      const normalizedAmount =
        data.amount === undefined ? undefined : roundMajorUnits(data.amount, currency);
      if (data.amount !== undefined && normalizedAmount !== data.amount) {
        throw new PaymentStateError(`Refund amount has too many decimals for ${currency}`);
      }

      const existing = await manager.findOne(RefundOperation, {
        where: { idempotencyKey: data.idempotencyKey },
        lock: { mode: 'pessimistic_write' },
      });
      if (existing) {
        const sameRequest =
          existing.paymentId === data.paymentId &&
          existing.requestedBy === data.requestedBy &&
          existing.fullRefund === (data.amount === undefined) &&
          (normalizedAmount === undefined || Number(existing.amount) === normalizedAmount) &&
          (existing.reason ?? '') === (data.reason ?? '');
        if (!sameRequest) {
          throw new RefundIdempotencyConflictError(
            'Idempotency key has already been used for a different refund request'
          );
        }
        if (existing.status === RefundOperationStatus.FAILED) {
          throw new PaymentStateError(
            existing.errorMessage || 'This refund attempt failed; submit a new request'
          );
        }
        return {
          operation: existing,
          payment: existing.status === RefundOperationStatus.SUCCEEDED ? payment : undefined,
        };
      }

      if (payment.status === PaymentStatus.REFUNDED) {
        throw new PaymentStateError('Payment already refunded');
      }
      if (
        payment.status !== PaymentStatus.SUCCEEDED &&
        payment.status !== PaymentStatus.PARTIALLY_REFUNDED
      ) {
        throw new PaymentStateError('Can only refund succeeded payments');
      }

      const capturedAmount = Number(payment.amount);
      const alreadyRefunded = Number(payment.refundAmount ?? 0);
      const unresolved = await manager.find(RefundOperation, {
        where: {
          paymentId: payment.id,
          status: In([RefundOperationStatus.PENDING, RefundOperationStatus.INDETERMINATE]),
        },
      });
      const reservedAmount = unresolved.reduce((sum, item) => sum + Number(item.amount), 0);
      const available = roundMajorUnits(
        capturedAmount - alreadyRefunded - reservedAmount,
        currency
      );
      const requestedAmount = normalizedAmount === undefined ? available : normalizedAmount;

      if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
        throw new PaymentStateError('Refund amount must be greater than 0');
      }
      if (requestedAmount > available) {
        throw new PaymentStateError(
          `Refund amount exceeds the refundable balance of ${formatMajorUnits(available, currency, await getPlatformLocale())}`
        );
      }

      const operation = manager.create(RefundOperation, {
        idempotencyKey: data.idempotencyKey,
        paymentId: payment.id,
        requestedBy: data.requestedBy,
        amount: requestedAmount,
        fullRefund: data.amount === undefined,
        currency,
        reason: data.reason ?? null,
        status: RefundOperationStatus.PENDING,
      });
      return { operation: await manager.save(operation) };
    });
  }

  private async recordRefundFailure(
    operationId: string,
    status: RefundOperationStatus.FAILED | RefundOperationStatus.INDETERMINATE,
    error: unknown
  ): Promise<void> {
    const message = error instanceof Error ? error.message : 'Unknown Stripe error';
    // A concurrent retry may already have finalized Stripe's replay. Never let a
    // slower failing request downgrade that terminal success back to indeterminate.
    await AppDataSource.getRepository(RefundOperation).update(
      {
        id: operationId,
        status: In([RefundOperationStatus.PENDING, RefundOperationStatus.INDETERMINATE]),
      },
      { status, errorMessage: message }
    );
  }

  private async finalizeRefund(operationId: string, stripeRefund: Stripe.Refund): Promise<Payment> {
    return AppDataSource.transaction(async (manager) => {
      const operationIdentity = await manager.findOneOrFail(RefundOperation, {
        where: { id: operationId },
      });
      const payment = await manager.findOneOrFail(Payment, {
        where: { id: operationIdentity.paymentId },
        lock: { mode: 'pessimistic_write' },
      });
      // Keep the same lock order as claimRefund (payment, then operation). The
      // reverse order deadlocks when a retry claims while another request finalizes.
      const operation = await manager.findOneOrFail(RefundOperation, {
        where: { id: operationId },
        lock: { mode: 'pessimistic_write' },
      });

      // A concurrent retry can receive Stripe's replayed response. Only the first
      // finalizer is allowed to add the operation amount to the payment total.
      if (operation.status === RefundOperationStatus.SUCCEEDED) return payment;

      const refundedNow = fromStripeMinorUnits(stripeRefund.amount, operation.currency);
      if (refundedNow !== Number(operation.amount)) {
        throw new RefundIndeterminateError(
          'Stripe returned a refund amount that differs from the reserved amount'
        );
      }

      const capturedAmount = Number(payment.amount);
      const totalRefunded = roundMajorUnits(
        Number(payment.refundAmount ?? 0) + refundedNow,
        operation.currency
      );
      if (totalRefunded > capturedAmount) {
        throw new RefundIndeterminateError('Refund would exceed the captured payment amount');
      }

      payment.status =
        totalRefunded < capturedAmount ? PaymentStatus.PARTIALLY_REFUNDED : PaymentStatus.REFUNDED;
      payment.refundedAt = new Date();
      payment.refundAmount = totalRefunded;
      payment.stripeRefundId = stripeRefund.id;
      payment.metadata = { ...payment.metadata, refund_reason: operation.reason ?? undefined };
      await manager.save(Payment, payment);

      operation.status = RefundOperationStatus.SUCCEEDED;
      operation.stripeRefundId = stripeRefund.id;
      operation.completedAt = new Date();
      operation.errorMessage = null;
      await manager.save(RefundOperation, operation);

      if (payment.status === PaymentStatus.REFUNDED) {
        await manager.update(Booking, payment.bookingId, { status: BookingStatus.CANCELLED });
      }
      return payment;
    });
  }

  /**
   * Replay-safe external portion shared by the request path and reconciler.
   */
  private async executeRefundOperation(operation: RefundOperation): Promise<Payment> {
    // Stripe may prune replay keys after 24 hours. Use the durable creation time
    // (not lastAttemptAt, which retries reset), with an hour of safety margin.
    // An unresolved old operation must retain its reservation for manual review.
    if (Date.now() - operation.createdAt.getTime() >= 23 * 60 * 60_000) {
      const error = new RefundIndeterminateError(
        'Refund retry window expired; manual reconciliation with Stripe is required'
      );
      await this.recordRefundFailure(operation.id, RefundOperationStatus.INDETERMINATE, error);
      throw error;
    }
    await AppDataSource.getRepository(RefundOperation).increment(
      { id: operation.id },
      'attemptCount',
      1
    );
    await AppDataSource.getRepository(RefundOperation).update(operation.id, {
      lastAttemptAt: new Date(),
    });

    let refund: Stripe.Refund;
    try {
      refund = await this.getStripe().refunds.create(
        {
          payment_intent: (
            await AppDataSource.getRepository(Payment).findOneByOrFail({ id: operation.paymentId })
          ).stripePaymentIntentId,
          amount: toStripeMinorUnits(Number(operation.amount), operation.currency),
          reason: 'requested_by_customer',
          metadata: {
            paymentId: operation.paymentId,
            requestedBy: operation.requestedBy,
            refundOperationId: operation.id,
            reason: operation.reason ?? '',
          },
        },
        { idempotencyKey: `refund:${operation.id}` }
      );
    } catch (stripeError: unknown) {
      const stripeDetails = stripeError as { type?: string; message?: string };
      // Authentication and permission failures prove Stripe rejected the call
      // before it could create a refund. They must release the reservation just
      // like an invalid request; retrying them with the same key cannot help.
      const definitive = [
        'StripeInvalidRequestError',
        'StripeAuthenticationError',
        'StripePermissionError',
      ].includes(stripeDetails.type ?? '');
      await this.recordRefundFailure(
        operation.id,
        definitive ? RefundOperationStatus.FAILED : RefundOperationStatus.INDETERMINATE,
        stripeError
      );
      if (!definitive) {
        logger.error('Indeterminate Stripe refund — operation needs reconciliation', {
          paymentId: operation.paymentId,
          refundOperationId: operation.id,
          idempotencyKey: `refund:${operation.id}`,
          type: stripeDetails.type,
          message: stripeDetails.message,
        });
        throw new RefundIndeterminateError();
      }
      throw stripeError;
    }

    try {
      const payment = await this.finalizeRefund(operation.id, refund);
      logger.info(`Payment refunded: ${operation.paymentId}, refund ID: ${refund.id}`);
      return payment;
    } catch (finalizeError) {
      await this.recordRefundFailure(
        operation.id,
        RefundOperationStatus.INDETERMINATE,
        finalizeError
      );
      throw new RefundIndeterminateError();
    }
  }

  /**
   * Execute a refund through a durable operation record. Stripe is deliberately
   * outside the database transaction: a commit failure can be retried with the
   * same Stripe key and will replay, rather than issue another refund.
   */
  public async processRefund(data: RefundData): Promise<Payment> {
    this.initRepositories();

    try {
      const claimed = await this.claimRefund(data);
      if (claimed.payment) return claimed.payment;
      return await this.executeRefundOperation(claimed.operation);
    } catch (error) {
      logger.error('Error processing refund:', error);
      throw error;
    }
  }

  /** Retry stale unresolved operations. A bounded batch prevents a Stripe outage
   * from turning recovery into an unbounded job. Concurrent workers are safe:
   * Stripe and finalization are both idempotent for one operation id.
   */
  public async reconcileRefundOperations(staleAfterMs = 2 * 60_000, limit = 20): Promise<number> {
    const cutoff = new Date(Date.now() - staleAfterMs);
    const retryWindowStart = new Date(Date.now() - 23 * 60 * 60_000);
    const operations = await AppDataSource.getRepository(RefundOperation).find({
      where: {
        status: In([RefundOperationStatus.PENDING, RefundOperationStatus.INDETERMINATE]),
        updatedAt: LessThan(cutoff),
        // Expired reservations are deliberately retained for manual
        // reconciliation, but must not occupy this bounded retry queue forever.
        createdAt: MoreThan(retryWindowStart),
      },
      // Rotate attempted rows behind untouched rows, including operations that
      // require manual reconciliation, so a full failed batch cannot starve recovery.
      order: { updatedAt: 'ASC', createdAt: 'ASC' },
      take: limit,
    });

    let reconciled = 0;
    for (const operation of operations) {
      try {
        await this.executeRefundOperation(operation);
        reconciled += 1;
      } catch (error) {
        logger.error('Refund reconciliation attempt failed', {
          refundOperationId: operation.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return reconciled;
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
}

export default new PaymentService();
