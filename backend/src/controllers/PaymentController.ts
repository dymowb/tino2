import { Request, Response } from 'express';
import { AppDataSource } from '@/config/database';
import Stripe from 'stripe';
import { Payment, PaymentStatus, PaymentMethod } from '@/models/Payment';
import { Booking } from '@/models/Booking';
import { User } from '@/models/User';
import { Provider } from '@/models/Provider';
import logger from '@/config/logger';
import { AuthenticatedRequest } from '@/types';
import PaymentService, { PaymentAccessError, PaymentStateError } from '@/services/PaymentService';
import { getStripeInstance, getStripeErrorMessage } from '@/config/stripe';
import { t } from '@/i18n';

// Lazy accessor — avoids crash-at-startup when STRIPE_SECRET_KEY is absent
const stripe = () => getStripeInstance();

class PaymentController {
  // GET /api/payments - Get user payments (FR-064)
  public async getPayments(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const paymentRepository = AppDataSource.getRepository(Payment);
      const { page = 1, limit = 10 } = req.query;

      // Resolve Provider entity ID when user is a provider
      // (payment.providerId stores Provider entity UUID, not User UUID)
      let whereConditions: any[];
      if (req.user.userType === 'provider') {
        const providerRepository = AppDataSource.getRepository(Provider);
        const providerEntity = await providerRepository.findOne({
          where: { userId: req.user.userId },
        });
        const providerEntityId = providerEntity?.id ?? req.user.userId;
        whereConditions = [{ providerId: providerEntityId }];
      } else {
        whereConditions = [{ customerId: req.user.userId }];
      }

      const payments = await paymentRepository.find({
        where: whereConditions,
        relations: ['customer', 'provider', 'booking', 'booking.customer'],
        order: { createdAt: 'DESC' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      });

      const total = await paymentRepository.count({
        where: whereConditions,
      });

      res.json({
        success: true,
        data: {
          payments,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
      });

      logger.info(`Payments retrieved for user ${req.user.userId}`);
    } catch (error) {
      logger.error('Error retrieving payments:', error);
      res.status(500).json({
        success: false,
        error: t(req, 'common.internal_error'),
      });
    }
  }

  // GET /api/payments/:id - Get payment by ID (FR-064)
  public async getPaymentById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const paymentRepository = AppDataSource.getRepository(Payment);

      // Ensure user can only access their own payments. providerId holds a Provider
      // entity UUID, so a provider's scope has to be resolved via Provider.userId first;
      // comparing it to req.user.userId 404s providers out of their own payments.
      let ownershipScope: Record<string, string>;
      if (req.user.userType === 'admin') {
        ownershipScope = {};
      } else if (req.user.userType === 'provider') {
        const providerEntityId = await PaymentService.resolveProviderEntityId(req.user.userId);
        if (!providerEntityId) {
          res.status(404).json({ success: false, error: t(req, 'payment.not_found') });
          return;
        }
        ownershipScope = { providerId: providerEntityId };
      } else {
        ownershipScope = { customerId: req.user.userId };
      }

      const payment = await paymentRepository.findOne({
        where: { id, ...ownershipScope },
        relations: ['customer', 'provider', 'booking', 'booking.customer'],
      });

      if (!payment) {
        res.status(404).json({
          success: false,
          error: t(req, 'payment.not_found'),
        });
        return;
      }

      res.json({
        success: true,
        data: payment,
      });

      logger.info(`Payment ${id} retrieved by user ${req.user.userId}`);
    } catch (error) {
      logger.error('Error retrieving payment:', error);
      res.status(500).json({
        success: false,
        error: t(req, 'common.internal_error'),
      });
    }
  }

  // POST /api/payments/setup-intent — create SetupIntent so customer can save card (no charge yet)
  public async createSetupIntent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({ where: { id: req.user.userId } });
      if (!user) {
        res.status(404).json({ success: false, error: t(req, 'common.user_not_found') });
        return;
      }

      // Get or create Stripe customer
      let stripeCustomerId = user.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await stripe().customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          metadata: { userId: user.id },
        });
        stripeCustomerId = customer.id;
        await userRepository.update(user.id, { stripeCustomerId });
      }

      const setupIntent = await stripe().setupIntents.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        metadata: { userId: user.id },
      });

      res.json({ success: true, data: { clientSecret: setupIntent.client_secret } });
    } catch (error) {
      logger.error('Error creating setup intent:', error);
      res.status(500).json({ success: false, error: getStripeErrorMessage(error) });
    }
  }

  // POST /api/payments/save-method — called after frontend confirms SetupIntent; persists paymentMethodId
  public async savePaymentMethod(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { paymentMethodId } = req.body;
      if (!paymentMethodId) {
        res.status(400).json({ success: false, error: t(req, 'payment.method_id_required') });
        return;
      }

      // Verify the payment method belongs to this customer via Stripe
      const pm = await stripe().paymentMethods.retrieve(paymentMethodId);
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({ where: { id: req.user.userId } });

      if (!user || pm.customer !== user.stripeCustomerId) {
        res.status(403).json({ success: false, error: t(req, 'payment.method_not_owned') });
        return;
      }

      await userRepository.update(user.id, { stripePaymentMethodId: paymentMethodId });
      res.json({ success: true });
    } catch (error) {
      logger.error('Error saving payment method:', error);
      res.status(500).json({ success: false, error: getStripeErrorMessage(error) });
    }
  }

  // POST /api/payments/intent - Create payment intent (FR-057, FR-058, FR-059)
  public async createPaymentIntent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // amount/currency are deliberately not read from the body — they are derived
      // from the booking so a client cannot choose what it is charged.
      const { bookingId, paymentMethod } = req.body;

      // Validate input using service
      const validationErrors = PaymentService.validatePaymentData({
        bookingId,
        customerId: req.user.userId,
        paymentMethod,
      });

      if (validationErrors.length > 0) {
        res.status(400).json({
          success: false,
          error: t(req, 'common.validation_failed'),
          details: validationErrors,
        });
        return;
      }

      // Create payment intent using service
      const result = await PaymentService.createPaymentIntent({
        bookingId,
        customerId: req.user.userId,
        paymentMethod,
      });

      res.json({
        success: true,
        data: {
          clientSecret: result.clientSecret,
          paymentIntentId: result.paymentIntentId,
          amount: result.payment.amount,
          platformFee: result.payment.platformFee,
          processingFee: result.payment.processingFee,
          providerAmount: result.payment.providerAmount,
        },
      });
    } catch (error) {
      logger.error('Error creating payment intent:', error);

      const errorMessage = getStripeErrorMessage(error);

      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  // POST /api/payments/:id/confirm - Confirm payment (capture escrow funds)
  public async confirmPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Confirm payment using service
      const payment = await PaymentService.confirmPayment(id, req.user.userId, req.user.userType);

      res.json({
        success: true,
        data: payment,
      });
    } catch (error) {
      logger.error('Error confirming payment:', error);
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      if (error instanceof PaymentAccessError) {
        // Outsiders get 404 so the endpoint does not confirm the payment exists.
        const outsider = errMsg === 'Payment not found';
        res.status(outsider ? 404 : 403).json({
          success: false,
          error: outsider ? t(req, 'payment.not_found') : errMsg,
        });
      } else if (errMsg === 'Payment not found' || errMsg === t(req, 'payment.not_found')) {
        res.status(404).json({ success: false, error: t(req, 'payment.not_found') });
      } else if (error instanceof PaymentStateError) {
        res.status(400).json({ success: false, error: errMsg });
      } else {
        res.status(500).json({ success: false, error: getStripeErrorMessage(error) });
      }
    }
  }

  // POST /api/payments/:id/refund - Process refund (FR-063)
  public async refundPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { amount, reason } = req.body;

      // Process refund using service
      const payment = await PaymentService.processRefund({
        paymentId: id,
        amount,
        reason,
        requestedBy: req.user.userId,
        requestedByUserType: req.user.userType,
      });

      res.json({
        success: true,
        data: {
          payment,
          refundAmount: payment.refundAmount,
          status: payment.status,
        },
      });
    } catch (error) {
      logger.error('Error processing refund:', error);
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      if (error instanceof PaymentAccessError) {
        // Outsiders get 404 so the endpoint does not confirm the payment exists.
        const outsider = errMsg === 'Payment not found';
        res.status(outsider ? 404 : 403).json({
          success: false,
          error: outsider ? t(req, 'payment.not_found') : errMsg,
        });
      } else if (errMsg === 'Payment not found' || errMsg === t(req, 'payment.not_found')) {
        res.status(404).json({ success: false, error: t(req, 'payment.not_found') });
      } else if (error instanceof PaymentStateError) {
        // State errors, not authorization errors. The previous ordering matched
        // 'only refund' as a 403 first, making this 400 branch unreachable; typing
        // them removes the substring guessing entirely.
        res.status(400).json({ success: false, error: errMsg });
      } else {
        res.status(500).json({
          success: false,
          error: getStripeErrorMessage(error),
        });
      }
    }
  }

  // GET /api/payments/customer/:customerId - Get customer payments
  public async getCustomerPayments(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { customerId } = req.params;

      // Only allow access to own payments or admin access
      if (req.user.userId !== customerId && req.user.userType !== 'admin') {
        res.status(403).json({
          success: false,
          error: t(req, 'common.unauthorized_access'),
        });
        return;
      }

      const paymentRepository = AppDataSource.getRepository(Payment);
      const payments = await paymentRepository.find({
        where: { customerId },
        relations: ['provider', 'booking'],
        order: { createdAt: 'DESC' },
      });

      res.json({
        success: true,
        data: payments,
      });

      logger.info(`Customer payments retrieved for ${customerId}`);
    } catch (error) {
      logger.error('Error retrieving customer payments:', error);
      res.status(500).json({
        success: false,
        error: t(req, 'common.internal_error'),
      });
    }
  }

  // GET /api/payments/provider/:providerId - Get provider payments
  public async getProviderPayments(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { providerId } = req.params;

      // Only allow access to own payments or admin access. `providerId` is a Provider
      // entity id, so it has to be resolved from the caller's userId — comparing it to
      // req.user.userId directly 403s every provider out of their own earnings.
      if (req.user.userType !== 'admin') {
        const ownProviderId = await PaymentService.resolveProviderEntityId(req.user.userId);
        if (!ownProviderId || ownProviderId !== providerId) {
          res.status(403).json({
            success: false,
            error: t(req, 'common.unauthorized_access'),
          });
          return;
        }
      }

      const paymentRepository = AppDataSource.getRepository(Payment);
      const payments = await paymentRepository.find({
        where: { providerId },
        relations: ['customer', 'booking'],
        order: { createdAt: 'DESC' },
      });

      res.json({
        success: true,
        data: payments,
      });

      logger.info(`Provider payments retrieved for ${providerId}`);
    } catch (error) {
      logger.error('Error retrieving provider payments:', error);
      res.status(500).json({
        success: false,
        error: t(req, 'common.internal_error'),
      });
    }
  }

  // POST /webhook/stripe - Handle Stripe webhooks (INT-003)
  public async handleStripeWebhook(req: Request, res: Response): Promise<void> {
    try {
      const sig = req.headers['stripe-signature'] as string;
      const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

      let event;
      try {
        event = stripe().webhooks.constructEvent(req.body, sig, endpointSecret);
      } catch (err) {
        logger.error('Webhook signature verification failed:', err);
        res.status(400).send('Webhook signature verification failed');
        return;
      }

      // Handle the webhook event using service
      await PaymentService.handleWebhookEvent(event);

      res.json({ received: true });
    } catch (error) {
      logger.error('Error handling Stripe webhook:', error);
      res.status(500).json({
        success: false,
        error: t(req, 'payment.webhook_failed'),
      });
    }
  }
}

export default new PaymentController();
