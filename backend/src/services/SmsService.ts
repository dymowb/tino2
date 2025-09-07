import twilio from 'twilio';
import config from '../config/environment';
import logger from '../config/logger';

export interface SmsMessage {
  to: string;
  message: string;
  from?: string;
}

export interface SmsResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SmsTemplate {
  bookingConfirmation: (params: { customerName: string; serviceName: string; date: string; providerName: string }) => string;
  bookingReminder: (params: { customerName: string; serviceName: string; date: string; time: string }) => string;
  bookingCancellation: (params: { customerName: string; serviceName: string; date: string; reason?: string }) => string;
  quoteReceived: (params: { customerName: string; providerName: string; serviceType: string; amount: number }) => string;
  paymentConfirmation: (params: { customerName: string; amount: number; serviceName: string }) => string;
  serviceStarted: (params: { customerName: string; providerName: string; serviceName: string }) => string;
  serviceCompleted: (params: { customerName: string; providerName: string; serviceName: string }) => string;
  providerAssigned: (params: { customerName: string; providerName: string; serviceName: string; date: string }) => string;
  reviewRequest: (params: { customerName: string; providerName: string; serviceName: string }) => string;
  verificationCode: (params: { code: string; expiryMinutes: number }) => string;
}

export class SmsService {
  private client: twilio.Twilio;
  private fromNumber: string;

  constructor() {
    if (!config.external.twilio.accountSid || !config.external.twilio.authToken) {
      logger.warn('Twilio credentials not configured. SMS service will be disabled.');
      return;
    }

    this.client = twilio(
      config.external.twilio.accountSid,
      config.external.twilio.authToken
    );
    this.fromNumber = config.external.twilio.phoneNumber;
  }

  /**
   * Send a single SMS message
   */
  async sendSms(message: SmsMessage): Promise<SmsResponse> {
    try {
      if (!this.client) {
        throw new Error('SMS service not configured');
      }

      const result = await this.client.messages.create({
        body: message.message,
        from: message.from || this.fromNumber,
        to: message.to,
      });

      logger.info(`SMS sent successfully to ${message.to}`, { messageId: result.sid });

      return {
        success: true,
        messageId: result.sid,
      };
    } catch (error) {
      logger.error('Failed to send SMS:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send SMS',
      };
    }
  }

  /**
   * Send SMS messages to multiple recipients
   */
  async sendBulkSms(messages: SmsMessage[]): Promise<SmsResponse[]> {
    const results: SmsResponse[] = [];

    for (const message of messages) {
      const result = await this.sendSms(message);
      results.push(result);
      
      // Add a small delay between messages to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }

  /**
   * Send booking confirmation SMS
   */
  async sendBookingConfirmation(
    phoneNumber: string,
    params: { customerName: string; serviceName: string; date: string; providerName: string }
  ): Promise<SmsResponse> {
    const message = this.templates.bookingConfirmation(params);
    return this.sendSms({ to: phoneNumber, message });
  }

  /**
   * Send booking reminder SMS
   */
  async sendBookingReminder(
    phoneNumber: string,
    params: { customerName: string; serviceName: string; date: string; time: string }
  ): Promise<SmsResponse> {
    const message = this.templates.bookingReminder(params);
    return this.sendSms({ to: phoneNumber, message });
  }

  /**
   * Send booking cancellation SMS
   */
  async sendBookingCancellation(
    phoneNumber: string,
    params: { customerName: string; serviceName: string; date: string; reason?: string }
  ): Promise<SmsResponse> {
    const message = this.templates.bookingCancellation(params);
    return this.sendSms({ to: phoneNumber, message });
  }

  /**
   * Send quote received notification SMS
   */
  async sendQuoteReceived(
    phoneNumber: string,
    params: { customerName: string; providerName: string; serviceType: string; amount: number }
  ): Promise<SmsResponse> {
    const message = this.templates.quoteReceived(params);
    return this.sendSms({ to: phoneNumber, message });
  }

  /**
   * Send payment confirmation SMS
   */
  async sendPaymentConfirmation(
    phoneNumber: string,
    params: { customerName: string; amount: number; serviceName: string }
  ): Promise<SmsResponse> {
    const message = this.templates.paymentConfirmation(params);
    return this.sendSms({ to: phoneNumber, message });
  }

  /**
   * Send service started notification SMS
   */
  async sendServiceStarted(
    phoneNumber: string,
    params: { customerName: string; providerName: string; serviceName: string }
  ): Promise<SmsResponse> {
    const message = this.templates.serviceStarted(params);
    return this.sendSms({ to: phoneNumber, message });
  }

  /**
   * Send service completed notification SMS
   */
  async sendServiceCompleted(
    phoneNumber: string,
    params: { customerName: string; providerName: string; serviceName: string }
  ): Promise<SmsResponse> {
    const message = this.templates.serviceCompleted(params);
    return this.sendSms({ to: phoneNumber, message });
  }

  /**
   * Send provider assigned notification SMS
   */
  async sendProviderAssigned(
    phoneNumber: string,
    params: { customerName: string; providerName: string; serviceName: string; date: string }
  ): Promise<SmsResponse> {
    const message = this.templates.providerAssigned(params);
    return this.sendSms({ to: phoneNumber, message });
  }

  /**
   * Send review request SMS
   */
  async sendReviewRequest(
    phoneNumber: string,
    params: { customerName: string; providerName: string; serviceName: string }
  ): Promise<SmsResponse> {
    const message = this.templates.reviewRequest(params);
    return this.sendSms({ to: phoneNumber, message });
  }

  /**
   * Send verification code SMS
   */
  async sendVerificationCode(
    phoneNumber: string,
    params: { code: string; expiryMinutes: number }
  ): Promise<SmsResponse> {
    const message = this.templates.verificationCode(params);
    return this.sendSms({ to: phoneNumber, message });
  }

  /**
   * Validate phone number format
   */
  validatePhoneNumber(phoneNumber: string): boolean {
    // Basic E.164 format validation
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    return phoneRegex.test(phoneNumber);
  }

  /**
   * Format phone number to E.164 format
   */
  formatPhoneNumber(phoneNumber: string, defaultCountryCode: string = '+1'): string {
    // Remove all non-numeric characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // If it doesn't start with country code, add default
    if (!cleaned.startsWith('1') && defaultCountryCode === '+1') {
      return `+1${cleaned}`;
    }
    
    return `+${cleaned}`;
  }

  /**
   * Get SMS delivery status
   */
  async getMessageStatus(messageId: string): Promise<any> {
    try {
      if (!this.client) {
        throw new Error('SMS service not configured');
      }

      const message = await this.client.messages(messageId).fetch();
      return {
        success: true,
        status: message.status,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        dateSent: message.dateSent,
        price: message.price,
        priceUnit: message.priceUnit,
      };
    } catch (error) {
      logger.error('Failed to get message status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get message status',
      };
    }
  }

  /**
   * SMS message templates
   */
  private templates: SmsTemplate = {
    bookingConfirmation: (params) =>
      `Hi ${params.customerName}! Your ${params.serviceName} booking with ${params.providerName} is confirmed for ${params.date}. We'll send you a reminder before your appointment. - Tino`,

    bookingReminder: (params) =>
      `Reminder: Your ${params.serviceName} appointment is scheduled for ${params.date} at ${params.time}. Please be available. - Tino`,

    bookingCancellation: (params) => {
      const reasonText = params.reason ? ` Reason: ${params.reason}` : '';
      return `Your ${params.serviceName} booking scheduled for ${params.date} has been cancelled.${reasonText} You can book again anytime. - Tino`;
    },

    quoteReceived: (params) =>
      `New quote from ${params.providerName} for ${params.serviceType}: $${params.amount}. View details in your Tino app to accept or decline. - Tino`,

    paymentConfirmation: (params) =>
      `Payment of $${params.amount} for ${params.serviceName} has been processed successfully. Thank you for choosing Tino! - Tino`,

    serviceStarted: (params) =>
      `${params.providerName} has started your ${params.serviceName}. You can track progress in your Tino app. - Tino`,

    serviceCompleted: (params) =>
      `Your ${params.serviceName} with ${params.providerName} is complete! Please rate your experience in the Tino app. - Tino`,

    providerAssigned: (params) =>
      `Great news! ${params.providerName} has been assigned to your ${params.serviceName} request for ${params.date}. They'll contact you soon. - Tino`,

    reviewRequest: (params) =>
      `How was your ${params.serviceName} with ${params.providerName}? Please leave a review in your Tino app to help other customers. - Tino`,

    verificationCode: (params) =>
      `Your Tino verification code is: ${params.code}. This code expires in ${params.expiryMinutes} minutes. Do not share this code with anyone.`,
  };
}

export default new SmsService();