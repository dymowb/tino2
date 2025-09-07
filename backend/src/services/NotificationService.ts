import EmailService from './EmailService';
import SmsService from './SmsService';
import { AppDataSource } from '../config/database';
import { User } from '../models/User';
import logger from '../config/logger';
import { Repository } from 'typeorm';

export interface NotificationPreferences {
  email: {
    bookings: boolean;
    quotes: boolean;
    payments: boolean;
    reviews: boolean;
    marketing: boolean;
  };
  sms: {
    bookings: boolean;
    quotes: boolean;
    payments: boolean;
    reviews: boolean;
    reminders: boolean;
  };
  push: {
    bookings: boolean;
    messages: boolean;
    quotes: boolean;
    general: boolean;
  };
}

export interface NotificationResult {
  email?: { success: boolean; messageId?: string; error?: string };
  sms?: { success: boolean; messageId?: string; error?: string };
}

export interface BookingNotificationParams {
  userId: string;
  customerName: string;
  serviceName: string;
  date: string;
  providerName: string;
  bookingId: string;
  location?: string;
  time?: string;
  reason?: string;
}

export interface QuoteNotificationParams {
  userId: string;
  customerName: string;
  providerName: string;
  serviceType: string;
  amount: number;
  quoteId: string;
  viewUrl: string;
}

export interface PaymentNotificationParams {
  userId: string;
  customerName: string;
  amount: number;
  serviceName: string;
  transactionId: string;
  receiptUrl: string;
}

export interface ReviewNotificationParams {
  userId: string;
  customerName: string;
  providerName: string;
  serviceName: string;
  reviewUrl: string;
}

export class NotificationService {
  private userRepository: Repository<User>;

  constructor() {
    this.userRepository = AppDataSource.getRepository(User);
  }

  /**
   * Get user notification preferences
   */
  async getUserPreferences(userId: string): Promise<NotificationPreferences> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      
      if (!user || !user.settings?.notifications) {
        // Return default preferences
        return this.getDefaultPreferences();
      }

      return user.settings.notifications;
    } catch (error) {
      logger.error('Failed to get user preferences:', error);
      return this.getDefaultPreferences();
    }
  }

  /**
   * Update user notification preferences
   */
  async updateUserPreferences(
    userId: string, 
    preferences: Partial<NotificationPreferences>
  ): Promise<void> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        throw new Error('User not found');
      }

      const currentSettings = user.settings || {};
      const updatedSettings = {
        ...currentSettings,
        notifications: {
          ...this.getDefaultPreferences(),
          ...currentSettings.notifications,
          ...preferences,
        },
      };

      await this.userRepository.update(userId, { settings: updatedSettings });
      logger.info(`Updated notification preferences for user ${userId}`);
    } catch (error) {
      logger.error('Failed to update user preferences:', error);
      throw error;
    }
  }

  /**
   * Send booking confirmation notification
   */
  async sendBookingConfirmation(params: BookingNotificationParams): Promise<NotificationResult> {
    const user = await this.getUserWithContact(params.userId);
    if (!user) return {};

    const preferences = await this.getUserPreferences(params.userId);
    const result: NotificationResult = {};

    // Send email if enabled
    if (preferences.email.bookings && user.email) {
      try {
        result.email = await EmailService.sendBookingConfirmationEmail(user.email, {
          customerName: params.customerName,
          serviceName: params.serviceName,
          date: params.date,
          providerName: params.providerName,
          bookingId: params.bookingId,
        });
      } catch (error) {
        logger.error('Failed to send booking confirmation email:', error);
        result.email = { success: false, error: 'Email send failed' };
      }
    }

    // Send SMS if enabled
    if (preferences.sms.bookings && user.phone) {
      try {
        result.sms = await SmsService.sendBookingConfirmation(user.phone, {
          customerName: params.customerName,
          serviceName: params.serviceName,
          date: params.date,
          providerName: params.providerName,
        });
      } catch (error) {
        logger.error('Failed to send booking confirmation SMS:', error);
        result.sms = { success: false, error: 'SMS send failed' };
      }
    }

    return result;
  }

  /**
   * Send booking reminder notification
   */
  async sendBookingReminder(params: BookingNotificationParams): Promise<NotificationResult> {
    const user = await this.getUserWithContact(params.userId);
    if (!user) return {};

    const preferences = await this.getUserPreferences(params.userId);
    const result: NotificationResult = {};

    // Send email reminder
    if (preferences.email.bookings && user.email && params.location) {
      try {
        result.email = await EmailService.sendBookingReminderEmail(user.email, {
          customerName: params.customerName,
          serviceName: params.serviceName,
          date: params.date,
          time: params.time || 'TBD',
          location: params.location,
        });
      } catch (error) {
        logger.error('Failed to send booking reminder email:', error);
        result.email = { success: false, error: 'Email send failed' };
      }
    }

    // Send SMS reminder
    if (preferences.sms.reminders && user.phone && params.time) {
      try {
        result.sms = await SmsService.sendBookingReminder(user.phone, {
          customerName: params.customerName,
          serviceName: params.serviceName,
          date: params.date,
          time: params.time,
        });
      } catch (error) {
        logger.error('Failed to send booking reminder SMS:', error);
        result.sms = { success: false, error: 'SMS send failed' };
      }
    }

    return result;
  }

  /**
   * Send booking cancellation notification
   */
  async sendBookingCancellation(params: BookingNotificationParams): Promise<NotificationResult> {
    const user = await this.getUserWithContact(params.userId);
    if (!user) return {};

    const preferences = await this.getUserPreferences(params.userId);
    const result: NotificationResult = {};

    // Send email notification
    if (preferences.email.bookings && user.email) {
      try {
        result.email = await EmailService.sendBookingCancellationEmail(user.email, {
          customerName: params.customerName,
          serviceName: params.serviceName,
          date: params.date,
          reason: params.reason,
        });
      } catch (error) {
        logger.error('Failed to send booking cancellation email:', error);
        result.email = { success: false, error: 'Email send failed' };
      }
    }

    // Send SMS notification
    if (preferences.sms.bookings && user.phone) {
      try {
        result.sms = await SmsService.sendBookingCancellation(user.phone, {
          customerName: params.customerName,
          serviceName: params.serviceName,
          date: params.date,
          reason: params.reason,
        });
      } catch (error) {
        logger.error('Failed to send booking cancellation SMS:', error);
        result.sms = { success: false, error: 'SMS send failed' };
      }
    }

    return result;
  }

  /**
   * Send quote received notification
   */
  async sendQuoteReceived(params: QuoteNotificationParams): Promise<NotificationResult> {
    const user = await this.getUserWithContact(params.userId);
    if (!user) return {};

    const preferences = await this.getUserPreferences(params.userId);
    const result: NotificationResult = {};

    // Send email notification
    if (preferences.email.quotes && user.email) {
      try {
        result.email = await EmailService.sendQuoteReceivedEmail(user.email, params);
      } catch (error) {
        logger.error('Failed to send quote received email:', error);
        result.email = { success: false, error: 'Email send failed' };
      }
    }

    // Send SMS notification
    if (preferences.sms.quotes && user.phone) {
      try {
        result.sms = await SmsService.sendQuoteReceived(user.phone, {
          customerName: params.customerName,
          providerName: params.providerName,
          serviceType: params.serviceType,
          amount: params.amount,
        });
      } catch (error) {
        logger.error('Failed to send quote received SMS:', error);
        result.sms = { success: false, error: 'SMS send failed' };
      }
    }

    return result;
  }

  /**
   * Send payment confirmation notification
   */
  async sendPaymentConfirmation(params: PaymentNotificationParams): Promise<NotificationResult> {
    const user = await this.getUserWithContact(params.userId);
    if (!user) return {};

    const preferences = await this.getUserPreferences(params.userId);
    const result: NotificationResult = {};

    // Send email notification
    if (preferences.email.payments && user.email) {
      try {
        result.email = await EmailService.sendPaymentConfirmationEmail(user.email, params);
      } catch (error) {
        logger.error('Failed to send payment confirmation email:', error);
        result.email = { success: false, error: 'Email send failed' };
      }
    }

    // Send SMS notification
    if (preferences.sms.payments && user.phone) {
      try {
        result.sms = await SmsService.sendPaymentConfirmation(user.phone, {
          customerName: params.customerName,
          amount: params.amount,
          serviceName: params.serviceName,
        });
      } catch (error) {
        logger.error('Failed to send payment confirmation SMS:', error);
        result.sms = { success: false, error: 'SMS send failed' };
      }
    }

    return result;
  }

  /**
   * Send service completed notification
   */
  async sendServiceCompleted(params: ReviewNotificationParams): Promise<NotificationResult> {
    const user = await this.getUserWithContact(params.userId);
    if (!user) return {};

    const preferences = await this.getUserPreferences(params.userId);
    const result: NotificationResult = {};

    // Send email notification
    if (preferences.email.reviews && user.email) {
      try {
        result.email = await EmailService.sendServiceCompletedEmail(user.email, params);
      } catch (error) {
        logger.error('Failed to send service completed email:', error);
        result.email = { success: false, error: 'Email send failed' };
      }
    }

    // Send SMS notification
    if (preferences.sms.reviews && user.phone) {
      try {
        result.sms = await SmsService.sendServiceCompleted(user.phone, {
          customerName: params.customerName,
          providerName: params.providerName,
          serviceName: params.serviceName,
        });
      } catch (error) {
        logger.error('Failed to send service completed SMS:', error);
        result.sms = { success: false, error: 'SMS send failed' };
      }
    }

    return result;
  }

  /**
   * Send review request notification
   */
  async sendReviewRequest(params: ReviewNotificationParams): Promise<NotificationResult> {
    const user = await this.getUserWithContact(params.userId);
    if (!user) return {};

    const preferences = await this.getUserPreferences(params.userId);
    const result: NotificationResult = {};

    // Send email notification
    if (preferences.email.reviews && user.email) {
      try {
        result.email = await EmailService.sendReviewRequestEmail(user.email, params);
      } catch (error) {
        logger.error('Failed to send review request email:', error);
        result.email = { success: false, error: 'Email send failed' };
      }
    }

    // Send SMS notification
    if (preferences.sms.reviews && user.phone) {
      try {
        result.sms = await SmsService.sendReviewRequest(user.phone, {
          customerName: params.customerName,
          providerName: params.providerName,
          serviceName: params.serviceName,
        });
      } catch (error) {
        logger.error('Failed to send review request SMS:', error);
        result.sms = { success: false, error: 'SMS send failed' };
      }
    }

    return result;
  }

  /**
   * Send welcome email to new users
   */
  async sendWelcomeNotification(userId: string, loginUrl: string): Promise<NotificationResult> {
    const user = await this.getUserWithContact(userId);
    if (!user || !user.email) return {};

    const result: NotificationResult = {};

    try {
      result.email = await EmailService.sendWelcomeEmail(user.email, {
        name: `${user.firstName} ${user.lastName}`,
        loginUrl,
      });
    } catch (error) {
      logger.error('Failed to send welcome email:', error);
      result.email = { success: false, error: 'Email send failed' };
    }

    return result;
  }

  /**
   * Send verification code
   */
  async sendVerificationCode(phoneNumber: string, code: string, expiryMinutes: number = 10): Promise<NotificationResult> {
    const result: NotificationResult = {};

    try {
      result.sms = await SmsService.sendVerificationCode(phoneNumber, {
        code,
        expiryMinutes,
      });
    } catch (error) {
      logger.error('Failed to send verification code:', error);
      result.sms = { success: false, error: 'SMS send failed' };
    }

    return result;
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(userId: string, resetUrl: string, expiryHours: number = 24): Promise<NotificationResult> {
    const user = await this.getUserWithContact(userId);
    if (!user || !user.email) return {};

    const result: NotificationResult = {};

    try {
      result.email = await EmailService.sendPasswordResetEmail(user.email, {
        name: `${user.firstName} ${user.lastName}`,
        resetUrl,
        expiryHours,
      });
    } catch (error) {
      logger.error('Failed to send password reset email:', error);
      result.email = { success: false, error: 'Email send failed' };
    }

    return result;
  }

  /**
   * Send email verification
   */
  async sendEmailVerification(userId: string, verificationUrl: string, code: string): Promise<NotificationResult> {
    const user = await this.getUserWithContact(userId);
    if (!user || !user.email) return {};

    const result: NotificationResult = {};

    try {
      result.email = await EmailService.sendEmailVerification(user.email, {
        name: `${user.firstName} ${user.lastName}`,
        verificationUrl,
        code,
      });
    } catch (error) {
      logger.error('Failed to send email verification:', error);
      result.email = { success: false, error: 'Email send failed' };
    }

    return result;
  }

  private async getUserWithContact(userId: string): Promise<User | null> {
    try {
      return await this.userRepository.findOne({
        where: { id: userId },
        select: ['id', 'email', 'phone', 'firstName', 'lastName', 'settings'],
      });
    } catch (error) {
      logger.error('Failed to get user contact info:', error);
      return null;
    }
  }

  private getDefaultPreferences(): NotificationPreferences {
    return {
      email: {
        bookings: true,
        quotes: true,
        payments: true,
        reviews: true,
        marketing: false,
      },
      sms: {
        bookings: true,
        quotes: true,
        payments: true,
        reviews: false,
        reminders: true,
      },
      push: {
        bookings: true,
        messages: true,
        quotes: true,
        general: false,
      },
    };
  }
}

export default new NotificationService();