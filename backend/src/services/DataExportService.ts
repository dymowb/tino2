import { In, Repository } from 'typeorm';
import { AppDataSource } from '@/config/database';
import MemoryDataSource from '@/config/memory.data-source';
import { BasicUser } from '@/models/BasicUser';
import { Booking } from '@/models/Booking';
import { Conversation } from '@/models/Conversation';
import { FavoriteProvider } from '@/models/FavoriteProvider';
import { Message } from '@/models/Message';
import { Notification } from '@/models/Notification';
import { Payment } from '@/models/Payment';
import { Provider } from '@/models/Provider';
import { Quote } from '@/models/Quote';
import { QuoteRequest } from '@/models/QuoteRequest';
import { Review } from '@/models/Review';
import logger from '@/config/logger';

/**
 * Assembles everything the platform holds about one account, for the account
 * holder to take away.
 *
 * Two rules shape what comes out, and both are deliberate:
 *
 * Fields are chosen by allowlist, never by removing a few from a serialized
 * entity. A blocklist quietly leaks whatever gets added to a model later, and the
 * models here carry password hashes, verification and reset tokens, Stripe
 * identifiers and admin-only dispute notes. Adding a column should never widen an
 * export by default.
 *
 * A conversation has two people in it. The requester gets their own messages in
 * full and enough about the thread to make sense of it — who it was with, which
 * booking, when — but not the other person's message bodies. Their side is not
 * the requester's data to take, and packaging it into a file the requester keeps
 * would hand over someone else's writing under the banner of portability. The
 * count is included so nothing looks hidden.
 */

/** Number-typed columns arrive from `pg` as strings; export them as numbers. */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface DataExport {
  meta: {
    format: string;
    generatedAt: string;
    subject: { id: string; email: string };
    notes: string[];
  };
  profile: Record<string, unknown>;
  providerProfile: Record<string, unknown> | null;
  bookings: Record<string, unknown>[];
  quoteRequests: Record<string, unknown>[];
  quotes: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  reviewsWritten: Record<string, unknown>[];
  reviewsReceived: Record<string, unknown>[];
  conversations: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  favoriteProviders: Record<string, unknown>[];
  assistantMemory: Record<string, unknown>[];
}

export class DataExportService {
  private users: Repository<BasicUser>;

  constructor() {
    this.users = AppDataSource.getRepository(BasicUser);
  }

  async exportForUser(userId: string): Promise<DataExport> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    // A provider's own records hang off the Provider entity, not the user id —
    // the distinction that has caused authorization bugs in this codebase more
    // than once. Resolve it up front so every provider-side query uses it.
    const provider = await AppDataSource.getRepository(Provider).findOne({
      where: { userId },
    });
    const providerId = provider?.id ?? null;

    const [
      bookings,
      quoteRequests,
      quotes,
      payments,
      reviewsWritten,
      reviewsReceived,
      notifications,
      favorites,
      conversations,
      assistantMemory,
    ] = await Promise.all([
      this.bookings(userId, providerId),
      this.quoteRequests(userId),
      this.quotes(userId, providerId),
      this.payments(userId, providerId),
      this.reviewsWritten(userId),
      this.reviewsReceived(providerId),
      this.notifications(userId),
      this.favorites(userId),
      this.conversations(userId),
      this.assistantMemory(userId),
    ]);

    return {
      meta: {
        format: 'tino2.data-export.v1',
        generatedAt: new Date().toISOString(),
        subject: { id: user.id, email: user.email },
        notes: [
          'Messages written by the people you talked to are not included; your own are, in full.',
          'Payment gateway identifiers are omitted. Card details are never stored by this platform.',
          'Uploaded files are referenced by name and URL rather than embedded.',
        ],
      },
      profile: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        userType: user.userType,
        isActive: user.isActive,
        isVerified: user.isVerified,
        profileImage: user.profileImage,
        settings: user.settings,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      providerProfile: provider
        ? {
            id: provider.id,
            businessName: provider.businessName,
            description: provider.description,
            services: provider.services,
            pricing: provider.pricing,
            serviceRadius: num(provider.serviceRadius),
            location: provider.location,
            availableHours: provider.availableHours,
            rating: num(provider.rating),
            totalReviews: num(provider.totalReviews),
            completedJobs: num(provider.completedJobs),
            verifiedAt: provider.verifiedAt,
            isActive: provider.isActive,
            createdAt: provider.createdAt,
          }
        : null,
      bookings,
      quoteRequests,
      quotes,
      payments,
      reviewsWritten,
      reviewsReceived,
      conversations,
      notifications,
      favoriteProviders: favorites,
      assistantMemory,
    };
  }

  private async bookings(userId: string, providerId: string | null) {
    const rows = await AppDataSource.getRepository(Booking).find({
      where: [{ customerId: userId }, ...(providerId ? [{ providerId }] : [])],
      order: { createdAt: 'DESC' },
    });

    return rows.map((booking) => ({
      id: booking.id,
      role: booking.customerId === userId ? 'customer' : 'provider',
      quoteId: booking.quoteId,
      requestId: booking.requestId,
      serviceType: booking.serviceType,
      description: booking.description,
      location: booking.location,
      scheduledDate: booking.scheduledDate,
      estimatedDuration: booking.estimatedDuration,
      totalAmount: num(booking.totalAmount),
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      specialInstructions: booking.specialInstructions,
      confirmedAt: booking.confirmedAt,
      startedAt: booking.startedAt,
      completedAt: booking.completedAt,
      cancelledAt: booking.cancelledAt,
      cancellationReason: booking.cancellationReason,
      isDisputed: booking.isDisputed,
      disputeStatus: booking.disputeStatus,
      disputeReason: booking.disputeReason,
      createdAt: booking.createdAt,
      // `adminNotes` and the dispute resolution trail stay internal: they are
      // written by staff about the case, not by or for either party.
    }));
  }

  private async quoteRequests(userId: string) {
    const rows = await AppDataSource.getRepository(QuoteRequest).find({
      where: { customerId: userId },
      order: { createdAt: 'DESC' },
    });

    return rows.map((request) => ({
      id: request.id,
      serviceType: request.serviceType,
      category: request.category,
      description: request.description,
      location: request.location,
      preferredDate: request.preferredDate,
      budget: request.budget,
      urgency: request.urgency,
      status: request.status,
      requirements: request.requirements,
      images: request.images,
      searchRadius: num(request.searchRadius),
      quotesReceived: num(request.quotesReceived),
      sourceBookingId: request.sourceBookingId,
      expiresAt: request.expiresAt,
      closedAt: request.closedAt,
      closureReason: request.closureReason,
      createdAt: request.createdAt,
      // `targetProviderIds` is left out: who a broadcast reached is platform
      // routing, and naming providers who never responded is not the customer's
      // record to keep.
    }));
  }

  private async quotes(userId: string, providerId: string | null) {
    const rows = await AppDataSource.getRepository(Quote).find({
      where: [{ customerId: userId }, ...(providerId ? [{ providerId }] : [])],
      order: { createdAt: 'DESC' },
    });

    return rows.map((quote) => ({
      id: quote.id,
      role: quote.providerId === providerId ? 'provider' : 'customer',
      requestId: quote.requestId,
      serviceType: quote.serviceType,
      description: quote.description,
      estimatedPrice: num(quote.estimatedPrice),
      estimatedDuration: num(quote.estimatedDuration),
      breakdown: quote.breakdown,
      terms: quote.terms,
      notes: quote.notes,
      attachments: quote.attachments,
      validUntil: quote.validUntil,
      status: quote.status,
      acceptedAt: quote.acceptedAt,
      rejectedAt: quote.rejectedAt,
      rejectionReason: quote.rejectionReason,
      createdAt: quote.createdAt,
    }));
  }

  private async payments(userId: string, providerId: string | null) {
    const rows = await AppDataSource.getRepository(Payment).find({
      where: [{ customerId: userId }, ...(providerId ? [{ providerId }] : [])],
      order: { createdAt: 'DESC' },
    });

    return rows.map((payment) => ({
      id: payment.id,
      role: payment.customerId === userId ? 'customer' : 'provider',
      bookingId: payment.bookingId,
      amount: num(payment.amount),
      currency: payment.currency,
      platformFee: num(payment.platformFee),
      providerAmount: num(payment.providerAmount),
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      refundAmount: num(payment.refundAmount),
      paidAt: payment.paidAt,
      completedAt: payment.completedAt,
      failedAt: payment.failedAt,
      refundedAt: payment.refundedAt,
      createdAt: payment.createdAt,
      // Stripe/PayPal identifiers are omitted. They are gateway plumbing, of no
      // use outside this platform, and one more thing to leak from a file that
      // ends up in a downloads folder.
    }));
  }

  private async reviewsWritten(userId: string) {
    const rows = await AppDataSource.getRepository(Review).find({
      where: { customerId: userId },
      order: { createdAt: 'DESC' },
    });

    return rows.map((review) => ({
      id: review.id,
      bookingId: review.bookingId,
      providerId: review.providerId,
      rating: num(review.rating),
      comment: review.comment,
      criteria: review.criteria,
      images: review.images,
      response: review.response,
      respondedAt: review.respondedAt,
      createdAt: review.createdAt,
    }));
  }

  private async reviewsReceived(providerId: string | null) {
    if (!providerId) return [];

    const rows = await AppDataSource.getRepository(Review).find({
      where: { providerId },
      order: { createdAt: 'DESC' },
    });

    return rows.map((review) => ({
      id: review.id,
      bookingId: review.bookingId,
      rating: num(review.rating),
      comment: review.comment,
      criteria: review.criteria,
      response: review.response,
      respondedAt: review.respondedAt,
      createdAt: review.createdAt,
      // The customer who wrote it is not named. A provider can already see the
      // review in the product; a portable copy does not need to attach an
      // identity to it.
    }));
  }

  private async notifications(userId: string) {
    const rows = await AppDataSource.getRepository(Notification).find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return rows.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      isRead: notification.isRead,
      actionUrl: notification.actionUrl,
      createdAt: notification.createdAt,
      readAt: notification.readAt,
    }));
  }

  private async favorites(userId: string) {
    const rows = await AppDataSource.getRepository(FavoriteProvider).find({
      where: { customerId: userId },
      relations: ['provider'],
      order: { createdAt: 'DESC' },
    });

    return rows.map((favorite) => ({
      providerId: favorite.providerId,
      businessName: favorite.provider?.businessName ?? null,
      savedAt: favorite.createdAt,
    }));
  }

  private async conversations(userId: string) {
    const conversations = await AppDataSource.getRepository(Conversation)
      .createQueryBuilder('conversation')
      .innerJoin('conversation.participants', 'me', 'me.id = :userId', { userId })
      .leftJoinAndSelect('conversation.participants', 'participant')
      .orderBy('conversation.createdAt', 'DESC')
      .getMany();

    if (conversations.length === 0) return [];

    const messages = await AppDataSource.getRepository(Message).find({
      where: { conversationId: In(conversations.map((conversation) => conversation.id)) },
      order: { createdAt: 'ASC' },
    });

    return conversations.map((conversation) => {
      const inThread = messages.filter((message) => message.conversationId === conversation.id);
      const mine = inThread.filter((message) => message.senderId === userId);

      return {
        id: conversation.id,
        bookingId: conversation.metadata?.bookingId ?? null,
        title: conversation.title,
        startedAt: conversation.createdAt,
        lastMessageAt: conversation.lastMessageAt,
        // Enough to know who this was with, without their contact details.
        counterparts: (conversation.participants ?? [])
          .filter((participant) => participant.id !== userId)
          .map((participant) => ({
            name: `${participant.firstName} ${participant.lastName}`.trim(),
            role: participant.userType,
          })),
        messagesFromCounterparts: inThread.length - mine.length,
        messages: mine.map((message) => ({
          sentAt: message.createdAt,
          message: message.message,
          messageType: message.messageType,
          attachments: message.attachments,
          isRead: message.isRead,
          editedAt: message.editedAt,
        })),
      };
    });
  }

  private async assistantMemory(userId: string) {
    if (!MemoryDataSource.isInitialized) return [];

    try {
      // Raw query because the embedding columns are not on the entity — and the
      // vectors are not selected here anyway: they are a derived representation,
      // meaningless outside this system and enormous next to the text they encode.
      //
      // This table is snake_case in the database while the entity is camelCase, so
      // the column names have to be written as the schema has them and aliased
      // back. Every other raw query against this store does the same.
      const rows: Array<Record<string, unknown>> = await MemoryDataSource.query(
        `SELECT "id",
                "content",
                "confidence",
                "importance",
                "source_type"  AS "sourceType",
                "source_ref"   AS "sourceRef",
                "is_active"    AS "isActive",
                "created_at"   AS "createdAt",
                "expires_at"   AS "expiresAt",
                "last_accessed_at" AS "lastAccessedAt",
                "metadata"
           FROM "semantic_memories"
          WHERE "user_id" = $1
          ORDER BY "created_at" DESC`,
        [userId]
      );
      return rows;
    } catch (error) {
      // The assistant memory lives in its own database. If it is unreachable the
      // rest of the export is still worth delivering, so this degrades instead of
      // failing — and says so rather than looking like an empty history.
      logger.warn('Data export could not read assistant memory:', error);
      return [{ unavailable: true, reason: 'assistant memory store unreachable at export time' }];
    }
  }
}

export const dataExportService = new DataExportService();
