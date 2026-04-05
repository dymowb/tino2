import cron from 'node-cron';
import { AppDataSource } from '@/config/database';
import { Booking, BookingStatus } from '@/models/Booking';
import { AppSettings } from '@/models/AppSettings';
import { getStripeInstance } from '@/config/stripe';
import notificationService from '@/services/NotificationService';
import { NotificationType } from '@/models/Notification';
import logger from '@/config/logger';

const DEFAULT_AUTO_CAPTURE_DAYS = 3;

async function getAutoCaptureDays(): Promise<number> {
  try {
    const setting = await AppDataSource.getRepository(AppSettings).findOne({
      where: { key: 'auto_capture_days' },
    });
    return setting ? setting.getValue<number>() : DEFAULT_AUTO_CAPTURE_DAYS;
  } catch {
    return DEFAULT_AUTO_CAPTURE_DAYS;
  }
}

export async function runAutoCapture(): Promise<void> {
  const stripe = getStripeInstance();
  const bookingRepo = AppDataSource.getRepository(Booking);
  const days = await getAutoCaptureDays();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Find all bookings stuck in PENDING_COMPLETION past the cutoff
  const staleBookings = await bookingRepo
    .createQueryBuilder('booking')
    .where('booking.status = :status', { status: BookingStatus.PENDING_COMPLETION })
    .andWhere('booking.completedAt < :cutoff', { cutoff })
    .andWhere('booking.stripePaymentIntentId IS NOT NULL')
    .leftJoinAndSelect('booking.provider', 'provider')
    .getMany();

  logger.info(`Auto-capture job: found ${staleBookings.length} stale booking(s) (cutoff: ${days} days)`);

  for (const booking of staleBookings) {
    try {
      await stripe.paymentIntents.capture(booking.stripePaymentIntentId);
      booking.status = BookingStatus.COMPLETED;
      await bookingRepo.save(booking);

      notificationService.createNotification(booking.customerId, {
        type: NotificationType.PAYMENT,
        title: 'Payment auto-released',
        message: `No response received within ${days} days — payment has been released to the provider.`,
        actionUrl: `/bookings/${booking.id}`,
        metadata: { bookingId: booking.id },
      }).catch(() => {});

      logger.info(`Auto-captured payment for booking ${booking.id}`);
    } catch (err) {
      logger.error(`Auto-capture failed for booking ${booking.id}:`, err);
    }
  }
}

// Runs daily at 2am — off-peak to avoid contention with user activity
export function startAutoCaptureJob(): void {
  cron.schedule('0 2 * * *', async () => {
    logger.info('Running auto-capture job...');
    await runAutoCapture();
  });
  logger.info('Auto-capture cron job scheduled (daily at 02:00)');
}
