import Stripe from 'stripe';
import config from './environment';
import logger from './logger';
import { DEFAULT_PLATFORM_CURRENCY } from '@/utils/money';

// Stripe configuration interface
export interface StripeConfig {
  apiVersion: '2025-08-27.basil';
  publishableKey: string;
  secretKey: string;
  webhookSecret: string;
  platformFeeRate: number;
  processingFeeRate: number;
  processingFeeFixed: number;
  maxPaymentAmount: number;
  supportedCurrencies: string[];
  supportedPaymentMethods: string[];
}

// Default Stripe configuration
const stripeConfig: StripeConfig = {
  apiVersion: '2025-08-27.basil',
  publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
  secretKey: process.env.STRIPE_SECRET_KEY || '',
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  platformFeeRate: parseFloat(process.env.PLATFORM_FEE_RATE || '0.05'), // 5%
  processingFeeRate: parseFloat(process.env.STRIPE_FEE_RATE || '0.029'), // 2.9%
  processingFeeFixed: parseFloat(process.env.STRIPE_FEE_FIXED || '0.30'), // $0.30
  maxPaymentAmount: parseFloat(process.env.MAX_PAYMENT_AMOUNT || '999999.99'),
  // brl first: it is the currency this deployment actually prices in. Its absence
  // meant validateCurrency would have rejected every real payment had it been wired.
  supportedCurrencies: (process.env.SUPPORTED_CURRENCIES || 'brl,usd,eur,gbp,cad,aud').split(','),
  supportedPaymentMethods: ['card', 'us_bank_account', 'link', 'apple_pay', 'google_pay', 'paypal'],
};

// Initialize Stripe instance
let stripeInstance: Stripe | null = null;

export const getStripeInstance = (): Stripe => {
  if (!stripeInstance) {
    if (!stripeConfig.secretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }

    stripeInstance = new Stripe(stripeConfig.secretKey, {
      apiVersion: stripeConfig.apiVersion,
      typescript: true,
    });

    logger.info('Stripe instance initialized successfully');
  }

  return stripeInstance;
};

// Validate Stripe configuration
export const validateStripeConfig = (): void => {
  const requiredVars = ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET'];

  const missingVars = requiredVars.filter((varName) => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required Stripe environment variables: ${missingVars.join(', ')}`);
  }

  // Validate key formats
  if (!stripeConfig.secretKey.startsWith('sk_')) {
    throw new Error('Invalid Stripe secret key format');
  }

  if (!stripeConfig.publishableKey.startsWith('pk_')) {
    throw new Error('Invalid Stripe publishable key format');
  }

  // Validate webhook secret format
  if (!stripeConfig.webhookSecret.startsWith('whsec_')) {
    throw new Error('Invalid Stripe webhook secret format');
  }

  // Validate fee rates
  if (stripeConfig.platformFeeRate < 0 || stripeConfig.platformFeeRate > 1) {
    throw new Error('Platform fee rate must be between 0 and 1');
  }

  if (stripeConfig.processingFeeRate < 0 || stripeConfig.processingFeeRate > 1) {
    throw new Error('Processing fee rate must be between 0 and 1');
  }

  logger.info('Stripe configuration validated successfully');
};

// Calculate payment fees
export const calculateFees = (amount: number) => {
  const platformFee = Math.round(amount * stripeConfig.platformFeeRate * 100) / 100;
  const processingFee =
    Math.round((amount * stripeConfig.processingFeeRate + stripeConfig.processingFeeFixed) * 100) /
    100;
  const providerAmount = Math.round((amount - platformFee - processingFee) * 100) / 100;

  return {
    platformFee,
    processingFee,
    providerAmount,
    totalFees: platformFee + processingFee,
  };
};

// Validate payment amount
export const validatePaymentAmount = (
  amount: number,
  currency: string = DEFAULT_PLATFORM_CURRENCY.toLowerCase()
): void => {
  if (amount <= 0) {
    throw new Error('Payment amount must be greater than 0');
  }

  if (amount > stripeConfig.maxPaymentAmount) {
    throw new Error(`Payment amount cannot exceed ${stripeConfig.maxPaymentAmount}`);
  }

  // Minimum amounts by currency (in major units)
  const minimumAmounts: Record<string, number> = {
    brl: 0.5,
    usd: 0.5,
    eur: 0.5,
    gbp: 0.3,
    cad: 0.5,
    aud: 0.5,
  };

  const minAmount = minimumAmounts[currency.toLowerCase()];
  if (minAmount && amount < minAmount) {
    throw new Error(`Payment amount must be at least ${minAmount} ${currency.toUpperCase()}`);
  }
};

// Validate currency
export const validateCurrency = (currency: string): void => {
  if (!stripeConfig.supportedCurrencies.includes(currency.toLowerCase())) {
    throw new Error(
      `Unsupported currency: ${currency}. Supported currencies: ${stripeConfig.supportedCurrencies.join(', ')}`
    );
  }
};

// Create payment method options for frontend
export const getPaymentMethodOptions = () => ({
  card: {
    style: {
      base: {
        fontSize: '16px',
        color: '#424770',
        '::placeholder': {
          color: '#aab7c4',
        },
      },
      invalid: {
        color: '#9e2146',
      },
    },
  },
  paymentMethodCreation: 'manual',
  paymentMethodConfiguration: {
    displayPreference: {
      preference: 'unspecified',
    },
  },
});

// Common Stripe error messages
export const getStripeErrorMessage = (error: any): string => {
  if (error.type === 'StripeCardError') {
    // Card was declined
    switch (error.code) {
      case 'card_declined':
        return 'Your card was declined. Please try a different payment method.';
      case 'expired_card':
        return 'Your card has expired. Please use a different card.';
      case 'insufficient_funds':
        return 'Your card has insufficient funds. Please try a different payment method.';
      case 'incorrect_cvc':
        return "Your card's security code is incorrect. Please try again.";
      case 'processing_error':
        return 'An error occurred while processing your card. Please try again.';
      default:
        return error.message || 'Your card was declined. Please try a different payment method.';
    }
  } else if (error.type === 'StripeRateLimitError') {
    return 'Too many requests made to the API too quickly. Please try again.';
  } else if (error.type === 'StripeInvalidRequestError') {
    return "Invalid parameters were supplied to Stripe's API.";
  } else if (error.type === 'StripeAPIError') {
    return 'An error occurred with our payment system. Please try again.';
  } else if (error.type === 'StripeConnectionError') {
    return 'A network error occurred. Please check your connection and try again.';
  } else if (error.type === 'StripeAuthenticationError') {
    return 'Authentication with our payment system failed. Please contact support.';
  }

  return error.message || 'An unknown payment error occurred. Please try again.';
};

// Export configuration for use in other parts of the application
export { stripeConfig };
export default stripeConfig;
