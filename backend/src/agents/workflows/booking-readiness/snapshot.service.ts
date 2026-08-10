import { Between, In } from 'typeorm';
import { AppDataSource } from '@/config/database';
import { Booking, BookingStatus } from '@/models/Booking';
import { Provider } from '@/models/Provider';
import { Quote } from '@/models/Quote';
import { QuoteRequest } from '@/models/QuoteRequest';
import { Conversation } from '@/models/Conversation';
import { Message } from '@/models/Message';
import { scrubPii } from '@/services/memory/PiiScrubber';
import { fingerprint } from '../shared/SourceFingerprint';
import { ReadinessSnapshot, SnapshotMessage } from './types';

/** Bookings where preparation is still meaningful. `pending` is excluded — nothing
 * is actually agreed until the quote is accepted and the hold is placed. */
export const ELIGIBLE_STATUSES: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.IN_PROGRESS,
  BookingStatus.PENDING_COMPLETION,
];

const MESSAGE_WINDOW = 30;
const AVAILABILITY_WINDOW_HOURS = 4;
const EXCERPT_LENGTH = 160;

export type ReadinessRole = 'customer' | 'provider';

export class ReadinessAccessError extends Error {
  constructor(
    message: string,
    readonly statusCode: 403 | 404 | 409
  ) {
    super(message);
    this.name = 'ReadinessAccessError';
  }
}

export interface AuthorizedBooking {
  booking: Booking;
  role: ReadinessRole;
}

/**
 * Resolves the caller's relationship to the booking.
 *
 * `booking.providerId` holds a **Provider** entity id, not a User id — comparing
 * it against `user.id` is the authorization bug that has recurred repeatedly in
 * this codebase, so the provider row is resolved from the user first.
 */
export async function authorizeBooking(
  bookingId: string,
  userId: string
): Promise<AuthorizedBooking> {
  const booking = await AppDataSource.getRepository(Booking).findOne({
    where: { id: bookingId },
  });
  if (!booking) throw new ReadinessAccessError('Booking not found', 404);

  if (booking.customerId === userId) {
    return { booking, role: 'customer' };
  }

  const provider = await AppDataSource.getRepository(Provider).findOne({
    where: { userId },
    select: ['id'],
  });
  if (provider && provider.id === booking.providerId) {
    return { booking, role: 'provider' };
  }

  // Same response for "not a participant" as for a booking that exists but
  // belongs to someone else — do not leak existence.
  throw new ReadinessAccessError('Booking not found', 404);
}

export function assertEligible(booking: Booking): void {
  if (!ELIGIBLE_STATUSES.includes(booking.status)) {
    throw new ReadinessAccessError(
      `Booking status "${booking.status}" is not eligible for readiness`,
      409
    );
  }
}

/**
 * Loads every record the agents may reason about. Nothing here comes from the
 * client: the caller supplies a booking id and their identity, and the server
 * decides what is true.
 */
export async function buildSnapshot(booking: Booking): Promise<ReadinessSnapshot> {
  const [quote, request, provider] = await Promise.all([
    booking.quoteId
      ? AppDataSource.getRepository(Quote).findOne({ where: { id: booking.quoteId } })
      : Promise.resolve(null),
    booking.requestId
      ? AppDataSource.getRepository(QuoteRequest).findOne({ where: { id: booking.requestId } })
      : Promise.resolve(null),
    AppDataSource.getRepository(Provider).findOne({ where: { id: booking.providerId } }),
  ]);

  const [messages, messagesTruncated] = await loadBookingMessages(booking);
  const conflictingBookingCount = await countAdjacentBookings(booking);

  return {
    booking: {
      id: booking.id,
      status: booking.status,
      serviceType: booking.serviceType,
      description: booking.description,
      scheduledDate: new Date(booking.scheduledDate).toISOString(),
      estimatedDuration: Number(booking.estimatedDuration),
      totalAmount: Number(booking.totalAmount),
      paymentStatus: booking.paymentStatus,
      specialInstructions: booking.specialInstructions || null,
      location: {
        address: booking.location?.address ?? '',
        city: booking.location?.city ?? '',
        state: booking.location?.state ?? '',
        zipCode: booking.location?.zipCode ?? '',
        // (0,0) is the sentinel this codebase uses for "never geocoded".
        hasCoordinates: Boolean(
          booking.location?.latitude &&
            booking.location?.longitude &&
            !(booking.location.latitude === 0 && booking.location.longitude === 0)
        ),
      },
    },
    quote: quote
      ? {
          id: quote.id,
          estimatedPrice: Number(quote.estimatedPrice),
          estimatedDuration: Number(quote.estimatedDuration),
          description: quote.description,
          terms: Array.isArray(quote.terms) ? quote.terms : [],
          notes: quote.notes || null,
        }
      : null,
    request: request
      ? {
          id: request.id,
          serviceType: request.serviceType,
          description: request.description,
          preferredDate: request.preferredDate
            ? new Date(request.preferredDate).toISOString()
            : null,
          requirements: Array.isArray(request.requirements) ? request.requirements : [],
        }
      : null,
    provider: {
      id: booking.providerId,
      businessName: provider?.businessName ?? '',
      services: provider?.services ?? [],
    },
    availability: {
      conflictingBookingCount,
      checkedWindowHours: AVAILABILITY_WINDOW_HOURS,
    },
    payment: {
      status: booking.paymentStatus,
      escrowHeld: booking.paymentStatus === 'paid',
    },
    messages,
    messagesTruncated,
  };
}

/**
 * Messages are the only untrusted content in the snapshot: they are user-authored
 * text that ends up in a prompt alongside platform facts. They are PII-scrubbed
 * here, attributed by role rather than name, and delimited at render time.
 */
async function loadBookingMessages(booking: Booking): Promise<[SnapshotMessage[], boolean]> {
  const conversations = await AppDataSource.getRepository(Conversation)
    .createQueryBuilder('conversation')
    .where("conversation.metadata ->> 'bookingId' = :bookingId", { bookingId: booking.id })
    .getMany();

  if (conversations.length === 0) return [[], false];

  const rows = await AppDataSource.getRepository(Message).find({
    where: { conversationId: In(conversations.map((c) => c.id)) },
    order: { createdAt: 'DESC' },
    take: MESSAGE_WINDOW + 1,
  });

  const truncated = rows.length > MESSAGE_WINDOW;
  const providerUserId = await resolveProviderUserId(booking.providerId);

  const messages = rows
    .slice(0, MESSAGE_WINDOW)
    .reverse()
    .map<SnapshotMessage>((row) => ({
      id: row.id,
      senderRole:
        row.senderId === booking.customerId
          ? 'customer'
          : row.senderId === providerUserId
            ? 'provider'
            : 'other',
      sentAt: new Date(row.createdAt).toISOString(),
      text: scrubPii(row.message ?? '').text,
    }));

  return [messages, truncated];
}

async function resolveProviderUserId(providerId: string): Promise<string | null> {
  const provider = await AppDataSource.getRepository(Provider).findOne({
    where: { id: providerId },
    select: ['userId'],
  });
  return provider?.userId ?? null;
}

/** Counts other active bookings for the same provider near this slot. */
async function countAdjacentBookings(booking: Booking): Promise<number> {
  const scheduled = new Date(booking.scheduledDate).getTime();
  const windowMs = AVAILABILITY_WINDOW_HOURS * 60 * 60 * 1000;

  const rows = await AppDataSource.getRepository(Booking).find({
    where: {
      providerId: booking.providerId,
      status: In([BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS]),
      scheduledDate: Between(new Date(scheduled - windowMs), new Date(scheduled + windowMs)),
    },
    select: ['id'],
  });

  return rows.filter((row) => row.id !== booking.id).length;
}

/**
 * The facts that would change the answer. Excludes `updatedAt` on purpose — a
 * cosmetic row touch must not mark every existing plan stale.
 */
export function snapshotFingerprint(snapshot: ReadinessSnapshot): string {
  return fingerprint({
    booking: {
      status: snapshot.booking.status,
      serviceType: snapshot.booking.serviceType,
      description: snapshot.booking.description,
      scheduledDate: snapshot.booking.scheduledDate,
      estimatedDuration: snapshot.booking.estimatedDuration,
      totalAmount: snapshot.booking.totalAmount,
      specialInstructions: snapshot.booking.specialInstructions,
      location: snapshot.booking.location,
    },
    quote: snapshot.quote,
    request: snapshot.request,
    payment: snapshot.payment,
    // Only the newest message id — earlier ones cannot change retroactively.
    lastMessageId: snapshot.messages[snapshot.messages.length - 1]?.id ?? null,
  });
}

/** Truncated, scrubbed text safe to show in the UI as evidence. */
export function excerptFor(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const scrubbed = scrubPii(value).text.replace(/\s+/g, ' ').trim();
  return scrubbed.length > EXCERPT_LENGTH
    ? `${scrubbed.slice(0, EXCERPT_LENGTH)}…`
    : scrubbed;
}
