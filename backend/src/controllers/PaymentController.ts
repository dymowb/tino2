import { Request, Response } from 'express';
import { AppDataSource } from '@/config/database';
import Stripe from 'stripe';
import { Payment, PaymentStatus, PaymentMethod } from '@/models/Payment';
import { Booking } from '@/models/Booking';
import { User } from '@/models/User';
import { Provider } from '@/models/Provider';
import logger from '@/config/logger';
import { AuthenticatedRequest } from '@/types';
import PaymentService from '@/services/PaymentService';
import { getStripeInstance, getStripeErrorMessage } from '@/config/stripe';

// Initialize Stripe
const stripe = getStripeInstance();

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
        const providerEntity = await providerRepository.findOne({ where: { userId: req.user.userId } });
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
          }
        }
      });

      logger.info(`Payments retrieved for user ${req.user.userId}`);
    } catch (error) {
      logger.error('Error retrieving payments:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // GET /api/payments/:id - Get payment by ID (FR-064)
  public async getPaymentById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const paymentRepository = AppDataSource.getRepository(Payment);

      const payment = await paymentRepository.findOne({
        where: {
          id,
          // Ensure user can only access their own payments
          ...(req.user.userType === 'customer' ? { customerId: req.user.userId } : { providerId: req.user.userId })
        },
        relations: ['customer', 'provider', 'booking', 'booking.customer'],
      });

      if (!payment) {
        res.status(404).json({
          success: false,
          error: 'Payment not found'
        });
        return;
      }

      res.json({
        success: true,
        data: payment
      });

      logger.info(`Payment ${id} retrieved by user ${req.user.userId}`);
    } catch (error) {
      logger.error('Error retrieving payment:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // POST /api/payments/setup-intent — create SetupIntent so customer can save card (no charge yet)
  public async createSetupIntent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({ where: { id: req.user.userId } });
      if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

      // Get or create Stripe customer
      let stripeCustomerId = user.stripeCustomerId;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          metadata: { userId: user.id },
        });
        stripeCustomerId = customer.id;
        await userRepository.update(user.id, { stripeCustomerId });
      }

      const setupIntent = await stripe.setupIntents.create({
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
      if (!paymentMethodId) { res.status(400).json({ success: false, error: 'paymentMethodId required' }); return; }

      // Verify the payment method belongs to this customer via Stripe
      const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({ where: { id: req.user.userId } });

      if (!user || pm.customer !== user.stripeCustomerId) {
        res.status(403).json({ success: false, error: 'Payment method does not belong to this customer' });
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
      const { bookingId, amount, currency, paymentMethod } = req.body;

      // Validate input using service
      const validationErrors = PaymentService.validatePaymentData({
        bookingId,
        customerId: req.user.userId,
        amount,
        currency,
        paymentMethod
      });

      if (validationErrors.length > 0) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: validationErrors
        });
        return;
      }

      // Create payment intent using service
      const result = await PaymentService.createPaymentIntent({
        bookingId,
        customerId: req.user.userId,
        amount,
        currency,
        paymentMethod
      });

      res.json({
        success: true,
        data: {
          clientSecret: result.clientSecret,
          paymentIntentId: result.paymentIntentId,
          amount: result.payment.amount,
          platformFee: result.payment.platformFee,
          processingFee: result.payment.processingFee,
          providerAmount: result.payment.providerAmount
        }
      });

    } catch (error) {
      logger.error('Error creating payment intent:', error);
      
      const errorMessage = getStripeErrorMessage(error);
      
      res.status(500).json({
        success: false,
        error: errorMessage
      });
    }
  }

  // POST /api/payments/:id/confirm - Confirm payment (capture escrow funds)
  public async confirmPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Confirm payment using service
      const payment = await PaymentService.confirmPayment(id, req.user.userId);

      res.json({
        success: true,
        data: payment
      });

    } catch (error) {
      logger.error('Error confirming payment:', error);
      
      if (error.message === 'Payment not found') {
        res.status(404).json({
          success: false,
          error: error.message
        });
      } else if (error.message.includes('Unauthorized')) {
        res.status(403).json({
          success: false,
          error: error.message
        });
      } else {
        const errorMessage = getStripeErrorMessage(error);
        res.status(500).json({
          success: false,
          error: errorMessage
        });
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
        requestedBy: req.user.userId
      });

      res.json({
        success: true,
        data: {
          payment,
          refundAmount: payment.refundAmount,
          status: payment.status
        }
      });

    } catch (error) {
      logger.error('Error processing refund:', error);
      
      if (error.message === 'Payment not found') {
        res.status(404).json({
          success: false,
          error: error.message
        });
      } else if (error.message.includes('Unauthorized') || error.message.includes('only refund')) {
        res.status(403).json({
          success: false,
          error: error.message
        });
      } else if (error.message.includes('Can only refund') || error.message.includes('already refunded')) {
        res.status(400).json({
          success: false,
          error: error.message
        });
      } else {
        const errorMessage = getStripeErrorMessage(error);
        res.status(500).json({
          success: false,
          error: errorMessage
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
          error: 'Unauthorized access'
        });
        return;
      }

      const paymentRepository = AppDataSource.getRepository(Payment);
      const payments = await paymentRepository.find({
        where: { customerId },
        relations: ['provider', 'booking'],
        order: { createdAt: 'DESC' }
      });

      res.json({
        success: true,
        data: payments
      });

      logger.info(`Customer payments retrieved for ${customerId}`);
    } catch (error) {
      logger.error('Error retrieving customer payments:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  // GET /api/payments/provider/:providerId - Get provider payments
  public async getProviderPayments(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { providerId } = req.params;

      // Only allow access to own payments or admin access
      if (req.user.userId !== providerId && req.user.userType !== 'admin') {
        res.status(403).json({
          success: false,
          error: 'Unauthorized access'
        });
        return;
      }

      const paymentRepository = AppDataSource.getRepository(Payment);
      const payments = await paymentRepository.find({
        where: { providerId },
        relations: ['customer', 'booking'],
        order: { createdAt: 'DESC' }
      });

      res.json({
        success: true,
        data: payments
      });

      logger.info(`Provider payments retrieved for ${providerId}`);
    } catch (error) {
      logger.error('Error retrieving provider payments:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
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
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
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
        error: 'Webhook handling failed'
      });
    }
  }
}

export default new PaymentController();