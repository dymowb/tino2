import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';
import config from '../config/environment';
import logger from '../config/logger';

export interface EmailMessage {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
}

export interface EmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailTemplate {
  welcome: (params: { name: string; loginUrl: string }) => { subject: string; html: string; text: string };
  bookingConfirmation: (params: { customerName: string; serviceName: string; date: string; providerName: string; bookingId: string }) => { subject: string; html: string; text: string };
  bookingReminder: (params: { customerName: string; serviceName: string; date: string; time: string; location: string }) => { subject: string; html: string; text: string };
  bookingCancellation: (params: { customerName: string; serviceName: string; date: string; reason?: string }) => { subject: string; html: string; text: string };
  quoteReceived: (params: { customerName: string; providerName: string; serviceType: string; amount: number; quoteId: string; viewUrl: string }) => { subject: string; html: string; text: string };
  paymentConfirmation: (params: { customerName: string; amount: number; serviceName: string; transactionId: string; receiptUrl: string }) => { subject: string; html: string; text: string };
  serviceCompleted: (params: { customerName: string; providerName: string; serviceName: string; reviewUrl: string }) => { subject: string; html: string; text: string };
  reviewRequest: (params: { customerName: string; providerName: string; serviceName: string; reviewUrl: string }) => { subject: string; html: string; text: string };
  passwordReset: (params: { name: string; resetUrl: string; expiryHours: number }) => { subject: string; html: string; text: string };
  emailVerification: (params: { name: string; verificationUrl: string; code: string }) => { subject: string; html: string; text: string };
  providerApproval: (params: { providerName: string; businessName: string; loginUrl: string }) => { subject: string; html: string; text: string };
  providerRejection: (params: { providerName: string; businessName: string; reason: string; reapplyUrl: string }) => { subject: string; html: string; text: string };
}

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private fromEmail: string;
  private useSendGrid: boolean;
  private ready: Promise<void>;

  constructor() {
    this.fromEmail = config.external.sendgrid.fromEmail || 'noreply@tino.local';

    if (config.external.sendgrid.apiKey) {
      sgMail.setApiKey(config.external.sendgrid.apiKey);
      this.useSendGrid = true;
      this.ready = Promise.resolve();
      logger.info('Email service initialized with SendGrid');
    } else {
      this.useSendGrid = false;
      this.ready = this.initializeSmtp();
    }
  }

  private async initializeSmtp(): Promise<void> {
    try {
      // Use Ethereal — a fake SMTP service that captures emails for inspection.
      // Preview URLs are logged after each send so you can open the email in a browser.
      const testAccount = await nodemailer.createTestAccount();
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      logger.info(`Email service ready (Ethereal). Inbox: https://ethereal.email/messages`);
    } catch (error) {
      logger.warn('Failed to create Ethereal test account:', error);
    }
  }

  /**
   * Send a single email
   */
  async sendEmail(message: EmailMessage): Promise<EmailResponse> {
    try {
      if (this.useSendGrid) {
        return await this.sendWithSendGrid(message);
      } else {
        return await this.sendWithSmtp(message);
      }
    } catch (error) {
      logger.error('Failed to send email:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email',
      };
    }
  }

  private async sendWithSendGrid(message: EmailMessage): Promise<EmailResponse> {
    const msg = {
      to: Array.isArray(message.to) ? message.to : [message.to],
      from: message.from || this.fromEmail,
      subject: message.subject,
      text: message.text,
      html: message.html,
      cc: message.cc,
      bcc: message.bcc,
      attachments: message.attachments?.map(att => ({
        filename: att.filename,
        content: att.content.toString('base64'),
        type: att.contentType || 'application/octet-stream',
        disposition: 'attachment',
      })),
    };

    const result = await sgMail.send(msg);
    
    logger.info(`Email sent successfully via SendGrid to ${message.to}`, { 
      messageId: result[0].headers['x-message-id'] 
    });

    return {
      success: true,
      messageId: result[0].headers['x-message-id'] as string,
    };
  }

  private async sendWithSmtp(message: EmailMessage): Promise<EmailResponse> {
    await this.ready;

    if (!this.transporter) {
      throw new Error('SMTP transporter not configured');
    }

    const mailOptions = {
      from: message.from || this.fromEmail,
      to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      cc: message.cc,
      bcc: message.bcc,
      attachments: message.attachments,
    };

    const result = await this.transporter.sendMail(mailOptions);

    // Ethereal captures the email — log the preview URL so you can open it in a browser
    const previewUrl = nodemailer.getTestMessageUrl(result);
    if (previewUrl) {
      logger.info(`📧 Email preview (Ethereal): ${previewUrl}`);
    }

    logger.info(`Email sent to ${message.to}`, { messageId: result.messageId });

    return {
      success: true,
      messageId: result.messageId,
    };
  }

  /**
   * Send emails to multiple recipients
   */
  async sendBulkEmails(messages: EmailMessage[]): Promise<EmailResponse[]> {
    const results: EmailResponse[] = [];

    for (const message of messages) {
      const result = await this.sendEmail(message);
      results.push(result);
      
      // Add delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }

  /**
   * Send welcome email to new users
   */
  async sendWelcomeEmail(
    email: string,
    params: { name: string; loginUrl: string }
  ): Promise<EmailResponse> {
    const template = this.templates.welcome(params);
    return this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send booking confirmation email
   */
  async sendBookingConfirmationEmail(
    email: string,
    params: { customerName: string; serviceName: string; date: string; providerName: string; bookingId: string }
  ): Promise<EmailResponse> {
    const template = this.templates.bookingConfirmation(params);
    return this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send booking reminder email
   */
  async sendBookingReminderEmail(
    email: string,
    params: { customerName: string; serviceName: string; date: string; time: string; location: string }
  ): Promise<EmailResponse> {
    const template = this.templates.bookingReminder(params);
    return this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send booking cancellation email
   */
  async sendBookingCancellationEmail(
    email: string,
    params: { customerName: string; serviceName: string; date: string; reason?: string }
  ): Promise<EmailResponse> {
    const template = this.templates.bookingCancellation(params);
    return this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send quote received notification email
   */
  async sendQuoteReceivedEmail(
    email: string,
    params: { customerName: string; providerName: string; serviceType: string; amount: number; quoteId: string; viewUrl: string }
  ): Promise<EmailResponse> {
    const template = this.templates.quoteReceived(params);
    return this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send payment confirmation email
   */
  async sendPaymentConfirmationEmail(
    email: string,
    params: { customerName: string; amount: number; serviceName: string; transactionId: string; receiptUrl: string }
  ): Promise<EmailResponse> {
    const template = this.templates.paymentConfirmation(params);
    return this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send service completed notification email
   */
  async sendServiceCompletedEmail(
    email: string,
    params: { customerName: string; providerName: string; serviceName: string; reviewUrl: string }
  ): Promise<EmailResponse> {
    const template = this.templates.serviceCompleted(params);
    return this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send review request email
   */
  async sendReviewRequestEmail(
    email: string,
    params: { customerName: string; providerName: string; serviceName: string; reviewUrl: string }
  ): Promise<EmailResponse> {
    const template = this.templates.reviewRequest(params);
    return this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    email: string,
    params: { name: string; resetUrl: string; expiryHours: number }
  ): Promise<EmailResponse> {
    const template = this.templates.passwordReset(params);
    return this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send email verification
   */
  async sendEmailVerification(
    email: string,
    params: { name: string; verificationUrl: string; code: string }
  ): Promise<EmailResponse> {
    const template = this.templates.emailVerification(params);
    return this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send provider approval email
   */
  async sendProviderApprovalEmail(
    email: string,
    params: { providerName: string; businessName: string; loginUrl: string }
  ): Promise<EmailResponse> {
    const template = this.templates.providerApproval(params);
    return this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send provider rejection email
   */
  async sendProviderRejectionEmail(
    email: string,
    params: { providerName: string; businessName: string; reason: string; reapplyUrl: string }
  ): Promise<EmailResponse> {
    const template = this.templates.providerRejection(params);
    return this.sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Validate email address
   */
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Email templates with HTML and text versions
   */
  private templates: EmailTemplate = {
    welcome: (params) => ({
      subject: 'Welcome to Tino - Your Home Services Platform',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Welcome to Tino, ${params.name}!</h1>
          <p>Thank you for joining Tino, the premier platform for connecting with trusted home service professionals.</p>
          <p>Get started by exploring our services and booking your first appointment:</p>
          <a href="${params.loginUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Access Your Account</a>
          <p>If you have any questions, our support team is here to help!</p>
          <p>Best regards,<br>The Tino Team</p>
        </div>
      `,
      text: `Welcome to Tino, ${params.name}! Thank you for joining our platform. Access your account at: ${params.loginUrl}`,
    }),

    bookingConfirmation: (params) => ({
      subject: `Booking Confirmed - ${params.serviceName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #28a745;">Booking Confirmed!</h1>
          <p>Hi ${params.customerName},</p>
          <p>Your booking has been confirmed with the following details:</p>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Service:</strong> ${params.serviceName}</p>
            <p><strong>Provider:</strong> ${params.providerName}</p>
            <p><strong>Date:</strong> ${params.date}</p>
            <p><strong>Booking ID:</strong> ${params.bookingId}</p>
          </div>
          <p>Your provider will contact you before the appointment. We'll also send you a reminder.</p>
          <p>Best regards,<br>The Tino Team</p>
        </div>
      `,
      text: `Booking confirmed! Service: ${params.serviceName}, Provider: ${params.providerName}, Date: ${params.date}, ID: ${params.bookingId}`,
    }),

    bookingReminder: (params) => ({
      subject: `Reminder: ${params.serviceName} appointment tomorrow`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #ffc107;">Appointment Reminder</h1>
          <p>Hi ${params.customerName},</p>
          <p>This is a friendly reminder about your upcoming appointment:</p>
          <div style="background-color: #fff3cd; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Service:</strong> ${params.serviceName}</p>
            <p><strong>Date:</strong> ${params.date}</p>
            <p><strong>Time:</strong> ${params.time}</p>
            <p><strong>Location:</strong> ${params.location}</p>
          </div>
          <p>Please ensure you're available at the scheduled time. Contact us if you need to reschedule.</p>
          <p>Best regards,<br>The Tino Team</p>
        </div>
      `,
      text: `Appointment reminder: ${params.serviceName} on ${params.date} at ${params.time} in ${params.location}`,
    }),

    bookingCancellation: (params) => ({
      subject: `Booking Cancelled - ${params.serviceName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc3545;">Booking Cancelled</h1>
          <p>Hi ${params.customerName},</p>
          <p>Your ${params.serviceName} booking scheduled for ${params.date} has been cancelled.</p>
          ${params.reason ? `<p><strong>Reason:</strong> ${params.reason}</p>` : ''}
          <p>You can book a new appointment anytime through your Tino account.</p>
          <p>If you have any questions, please contact our support team.</p>
          <p>Best regards,<br>The Tino Team</p>
        </div>
      `,
      text: `Your ${params.serviceName} booking for ${params.date} has been cancelled. ${params.reason || ''}`,
    }),

    quoteReceived: (params) => ({
      subject: `New Quote Received - ${params.serviceType}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #17a2b8;">New Quote Received</h1>
          <p>Hi ${params.customerName},</p>
          <p>You've received a new quote from ${params.providerName}:</p>
          <div style="background-color: #d1ecf1; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Service:</strong> ${params.serviceType}</p>
            <p><strong>Provider:</strong> ${params.providerName}</p>
            <p><strong>Quote Amount:</strong> $${params.amount}</p>
          </div>
          <a href="${params.viewUrl}" style="background-color: #17a2b8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">View Quote Details</a>
          <p>Best regards,<br>The Tino Team</p>
        </div>
      `,
      text: `New quote from ${params.providerName} for ${params.serviceType}: $${params.amount}. View at: ${params.viewUrl}`,
    }),

    paymentConfirmation: (params) => ({
      subject: `Payment Confirmation - $${params.amount}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #28a745;">Payment Confirmed</h1>
          <p>Hi ${params.customerName},</p>
          <p>Your payment has been processed successfully!</p>
          <div style="background-color: #d4edda; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Service:</strong> ${params.serviceName}</p>
            <p><strong>Amount:</strong> $${params.amount}</p>
            <p><strong>Transaction ID:</strong> ${params.transactionId}</p>
          </div>
          <a href="${params.receiptUrl}" style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Download Receipt</a>
          <p>Best regards,<br>The Tino Team</p>
        </div>
      `,
      text: `Payment confirmed: $${params.amount} for ${params.serviceName}. Transaction ID: ${params.transactionId}. Receipt: ${params.receiptUrl}`,
    }),

    serviceCompleted: (params) => ({
      subject: `Service Completed - ${params.serviceName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #28a745;">Service Completed</h1>
          <p>Hi ${params.customerName},</p>
          <p>Your ${params.serviceName} with ${params.providerName} has been completed!</p>
          <p>We hope you're satisfied with the service. Please take a moment to leave a review:</p>
          <a href="${params.reviewUrl}" style="background-color: #ffc107; color: black; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Leave a Review</a>
          <p>Your feedback helps other customers and supports our providers.</p>
          <p>Best regards,<br>The Tino Team</p>
        </div>
      `,
      text: `Service completed: ${params.serviceName} with ${params.providerName}. Leave a review at: ${params.reviewUrl}`,
    }),

    reviewRequest: (params) => ({
      subject: `Please Review Your Recent Service`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #ffc107;">How Was Your Experience?</h1>
          <p>Hi ${params.customerName},</p>
          <p>We hope you were pleased with your recent ${params.serviceName} from ${params.providerName}.</p>
          <p>Your review helps other customers choose the right provider and helps us maintain quality service.</p>
          <a href="${params.reviewUrl}" style="background-color: #ffc107; color: black; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Write Your Review</a>
          <p>Thank you for choosing Tino!</p>
          <p>Best regards,<br>The Tino Team</p>
        </div>
      `,
      text: `Please review your ${params.serviceName} experience with ${params.providerName}. Leave a review at: ${params.reviewUrl}`,
    }),

    passwordReset: (params) => ({
      subject: 'Reset Your Tino Password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc3545;">Password Reset Request</h1>
          <p>Hi ${params.name},</p>
          <p>You requested to reset your Tino password. Click the button below to create a new password:</p>
          <a href="${params.resetUrl}" style="background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
          <p>This link will expire in ${params.expiryHours} hours. If you didn't request this reset, please ignore this email.</p>
          <p>Best regards,<br>The Tino Team</p>
        </div>
      `,
      text: `Reset your password at: ${params.resetUrl} (expires in ${params.expiryHours} hours)`,
    }),

    emailVerification: (params) => ({
      subject: 'Verify Your Tino Email Address',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #007bff;">Verify Your Email</h1>
          <p>Hi ${params.name},</p>
          <p>Please verify your email address to complete your Tino account setup:</p>
          <div style="background-color: #e3f2fd; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center;">
            <p><strong>Verification Code:</strong></p>
            <h2 style="color: #007bff; font-size: 32px; margin: 10px 0;">${params.code}</h2>
          </div>
          <p>Or click the button below:</p>
          <a href="${params.verificationUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
          <p>Best regards,<br>The Tino Team</p>
        </div>
      `,
      text: `Verify your email with code: ${params.code} or visit: ${params.verificationUrl}`,
    }),

    providerApproval: (params) => ({
      subject: 'Welcome to Tino - Provider Application Approved!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #28a745;">Congratulations!</h1>
          <p>Hi ${params.providerName},</p>
          <p>Great news! Your application for ${params.businessName} has been approved.</p>
          <p>You can now start receiving bookings and growing your business with Tino.</p>
          <a href="${params.loginUrl}" style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Access Your Dashboard</a>
          <p>Welcome to the Tino provider community!</p>
          <p>Best regards,<br>The Tino Team</p>
        </div>
      `,
      text: `Congratulations! Your provider application for ${params.businessName} has been approved. Access your dashboard: ${params.loginUrl}`,
    }),

    providerRejection: (params) => ({
      subject: 'Provider Application Update',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc3545;">Application Update</h1>
          <p>Hi ${params.providerName},</p>
          <p>Thank you for your interest in joining Tino as a service provider for ${params.businessName}.</p>
          <p>Unfortunately, we're unable to approve your application at this time.</p>
          <p><strong>Reason:</strong> ${params.reason}</p>
          <p>You're welcome to address these concerns and reapply:</p>
          <a href="${params.reapplyUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reapply</a>
          <p>Best regards,<br>The Tino Team</p>
        </div>
      `,
      text: `Provider application for ${params.businessName} not approved. Reason: ${params.reason}. Reapply at: ${params.reapplyUrl}`,
    }),
  };
}

export default new EmailService();