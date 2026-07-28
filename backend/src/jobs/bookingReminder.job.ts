import cron from 'node-cron';
import { Between, In } from 'typeorm';
import { AppDataSource } from '@/config/database';
import { Booking, BookingStatus } from '@/models/Booking';
import notificationService from '@/services/NotificationService';
import { NotificationType } from '@/models/Notification';
import { instrumentJob } from '@/observability/jobMetrics';
import logger from '@/config/logger';

export async function runBookingReminders(now = new Date()): Promise<number> {
  return instrumentJob('booking-reminders', async () => {
    const start = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const bookings = await AppDataSource.getRepository(Booking).find({
      where: {
        status: In([BookingStatus.PENDING, BookingStatus.CONFIRMED]),
        scheduledDate: Between(start, end),
      },
      relations: ['customer', 'provider', 'provider.user'],
    });

    for (const booking of bookings) {
      const date = booking.scheduledDate.toLocaleDateString();
      const time = booking.scheduledDate.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      await notificationService.createNotification(booking.customerId, {
        type: NotificationType.BOOKING,
        title: 'Booking reminder',
        message: `${booking.serviceType} is scheduled for tomorrow at ${time}.`,
        actionUrl: `/bookings?bookingId=${booking.id}`,
        metadata: { bookingId: booking.id, reminderWindow: '24h' },
      });
      await notificationService.sendBookingReminder({
        userId: booking.customerId,
        customerName: booking.customer?.firstName || 'Customer',
        providerName: booking.provider?.businessName || booking.provider?.user?.firstName || '',
        serviceName: booking.serviceType,
        date,
        time,
        location: booking.location.address,
        bookingId: booking.id,
      });
    }
    return bookings.length;
  });
}

export function startBookingReminderJob(): void {
  cron.schedule('15 * * * *', () => {
    void runBookingReminders().catch((error) =>
      logger.error('Booking reminder job failed', { error })
    );
  });
  logger.info('Booking reminder cron job scheduled (hourly at :15)');
}
