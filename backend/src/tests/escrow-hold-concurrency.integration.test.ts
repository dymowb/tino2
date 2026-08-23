import request from 'supertest';
import App from '@/app';
import { AppDataSource } from '@/config/database';
import { BasicUser } from '@/models/BasicUser';
import { Provider } from '@/models/Provider';
import { Booking, BookingStatus } from '@/models/Booking';
import { User } from '@/models/User';
import { getStripeInstance } from '@/config/stripe';
import logger from '@/config/logger';

/**
 * Placing the escrow hold was read-check-call-save: confirm the booking is
 * `confirmed`, call Stripe, then write `in_progress` and the intent id. Nothing stood
 * between the check and the write, so two concurrent starts — a provider
 * double-clicking "Start Service" is enough — both passed the check and both
 * authorised the customer's card.
 *
 * The claim closes that. What these also pin is the surrounding rule, which is where
 * the harder mistakes were: the booking may only claim to be under way when a hold of
 * the right amount is actually behind it, and no failure may be resolved by guessing
 * about the customer's money.
 */
describe('escrow hold placement', () => {
  const server = new App().app;
  const password = 'TestPassword123!';

  /**
   * The shared mock instance every `new Stripe()` returns (see tests/setup.ts).
   *
   * Read through the singleton rather than `Stripe.mock.results`: the global
   * `beforeEach` calls `jest.clearAllMocks()`, which empties the constructor's
   * recorded results, and the instance is only constructed once — so from the second
   * test onward there is no result to read back.
   */
  function stripeMock(): { paymentIntents: { create: jest.Mock; cancel: jest.Mock } } {
    return getStripeInstance() as unknown as {
      paymentIntents: { create: jest.Mock; cancel: jest.Mock };
    };
  }

  async function account(email: string, userType: 'customer' | 'provider') {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password, firstName: 'Hold', lastName: userType, userType })
      .expect(201);
    const user = await AppDataSource.getRepository(BasicUser).findOneByOrFail({ email });
    await request(server)
      .get('/api/v1/auth/verify-email')
      .query({ token: user.emailVerificationToken })
      .expect(200);
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return { user, token: login.body.data.accessToken as string };
  }

  /** A confirmed booking whose customer has a saved card, i.e. ready to start. */
  async function startable(slug: string) {
    const customer = await account(`${slug}-customer@example.com`, 'customer');
    const providerAccount = await account(`${slug}-provider@example.com`, 'provider');

    const providerRepo = AppDataSource.getRepository(Provider);
    const provider = await providerRepo.save(
      providerRepo.create({
        userId: providerAccount.user.id,
        businessName: 'Hold Services',
        description: 'Integration test provider',
        services: ['plumbing'],
        location: {
          latitude: -27.59,
          longitude: -48.55,
          address: 'Test street',
          city: 'Florianópolis',
          state: 'SC',
          zipCode: '88000-000',
          country: 'BR',
        },
        serviceRadius: 25,
        availableHours: {},
        pricing: { baseRate: 100, currency: 'BRL', rateType: 'quote' },
      } as Partial<Provider>)
    );

    await AppDataSource.getRepository(User).update(customer.user.id, {
      stripeCustomerId: `cus_test_${slug}`,
      stripePaymentMethodId: `pm_test_${slug}`,
    });

    const booking = await AppDataSource.getRepository(Booking).save({
      customerId: customer.user.id,
      providerId: provider.id,
      serviceType: 'plumbing',
      description: 'Escrow hold scenario',
      scheduledDate: new Date(Date.now() + 86_400_000),
      estimatedDuration: 60,
      location: {
        latitude: -27.59,
        longitude: -48.55,
        address: 'Test street',
        city: 'Florianópolis',
        state: 'SC',
        zipCode: '88000-000',
      },
      totalAmount: 275,
      status: BookingStatus.CONFIRMED,
    } as Partial<Booking>);

    return { customer, providerAccount, provider, booking };
  }

  function start(bookingId: string, token: string) {
    return request(server)
      .post(`/api/v1/bookings/${bookingId}/start`)
      .set('Authorization', `Bearer ${token}`);
  }

  async function reload(bookingId: string) {
    return AppDataSource.getRepository(Booking).findOneByOrFail({ id: bookingId });
  }

  beforeEach(() => {
    const mock = stripeMock();
    mock.paymentIntents.create.mockClear();
    mock.paymentIntents.cancel.mockClear();
    mock.paymentIntents.create.mockResolvedValue({
      id: 'pi_test_hold',
      status: 'requires_capture',
    });
  });

  it('places exactly one hold when the same booking is started twice at once', async () => {
    const { providerAccount, booking } = await startable('hold-race');

    // Hold the first request inside the Stripe call so the second genuinely arrives
    // while it is in flight. Without this the two requests just serialize and the
    // loser sees a finished booking, which exercises a different branch entirely.
    stripeMock().paymentIntents.create.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ id: 'pi_test_hold', status: 'requires_capture' }), 200)
        )
    );

    const [a, b] = await Promise.all([
      start(booking.id, providerAccount.token),
      start(booking.id, providerAccount.token),
    ]);

    // One winner, one refusal — and critically, the card was authorised once.
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(stripeMock().paymentIntents.create).toHaveBeenCalledTimes(1);

    const after = await reload(booking.id);
    expect(after.status).toBe(BookingStatus.IN_PROGRESS);
    expect(after.stripePaymentIntentId).toBe('pi_test_hold');
  });

  it('keys the hold on the claim so the SDK cannot resend it into a second charge', async () => {
    const { providerAccount, booking } = await startable('hold-idem');

    await start(booking.id, providerAccount.token).expect(200);

    const options = stripeMock().paymentIntents.create.mock.calls.at(-1)?.[1];
    expect(options?.idempotencyKey).toMatch(new RegExp(`^booking:${booking.id}:hold:.+`));
  });

  it('gives a retry a fresh key after releasing a hold, instead of colliding', async () => {
    const { providerAccount, booking } = await startable('hold-retry-key');

    // First attempt: the price changes underneath it, so its hold is released and the
    // caller is told to retry.
    stripeMock().paymentIntents.create.mockImplementationOnce(async () => {
      await AppDataSource.query(`UPDATE bookings SET "totalAmount" = 400 WHERE id = $1`, [
        booking.id,
      ]);
      return { id: 'pi_test_first', status: 'requires_capture' };
    });
    await start(booking.id, providerAccount.token).expect(409);

    // The retry the message invites. A key fixed per booking would make it impossible:
    // Stripe rejects a repeated key whose parameters changed — and the amount has —
    // and would replay the just-cancelled intent if they had not.
    await start(booking.id, providerAccount.token).expect(200);

    const [first, second] = stripeMock().paymentIntents.create.mock.calls;
    expect(second[1].idempotencyKey).not.toBe(first[1].idempotencyKey);
    // Priced from the booking as it now stands, not as it was.
    expect(second[0].amount).toBe(40000);
  });

  it('cannot be marked complete while a claim exists but no hold backs it', async () => {
    const { providerAccount, booking } = await startable('hold-no-complete');

    const connectionError = Object.assign(new Error('network went away'), {
      type: 'StripeConnectionError',
    });
    stripeMock().paymentIntents.create.mockRejectedValueOnce(connectionError);
    await start(booking.id, providerAccount.token).expect(503);

    // The regression this guards: claiming by moving the booking to `in_progress` up
    // front. `markBookingComplete` gates on that status alone, so the provider could
    // complete a booking with no hold behind it and the customer's confirmation would
    // then capture a null intent.
    await request(server)
      .post(`/api/v1/bookings/${booking.id}/complete`)
      .set('Authorization', `Bearer ${providerAccount.token}`)
      .expect(400);

    expect((await reload(booking.id)).status).toBe(BookingStatus.CONFIRMED);
  });

  it('holds the claim and asks for help when Stripe fails indeterminately', async () => {
    const { providerAccount, booking } = await startable('hold-indeterminate');

    const connectionError = Object.assign(new Error('network went away'), {
      type: 'StripeConnectionError',
    });
    stripeMock().paymentIntents.create.mockRejectedValueOnce(connectionError);

    await start(booking.id, providerAccount.token).expect(503);

    // A hold may exist. The booking is deliberately left stuck rather than retryable:
    // every automatic recovery has to guess whether the customer's card was charged.
    const after = await reload(booking.id);
    expect(after.status).toBe(BookingStatus.CONFIRMED);
    expect(after.stripePaymentIntentId).toBeNull();
    expect(after.holdPlacedAt).not.toBeNull();
    expect(after.cancelledAt).toBeNull();

    // And it stays stuck — no second attempt may quietly authorise the card again.
    await start(booking.id, providerAccount.token).expect(409);
    expect(stripeMock().paymentIntents.create).toHaveBeenCalledTimes(1);
  });

  it('alerts with the key the request actually used, not a guess at it', async () => {
    const { providerAccount, booking } = await startable('hold-alert-key');

    const connectionError = Object.assign(new Error('network went away'), {
      type: 'StripeConnectionError',
    });
    stripeMock().paymentIntents.create.mockRejectedValueOnce(connectionError);

    await start(booking.id, providerAccount.token).expect(503);

    // This log is the only record that a hold may exist, and the booking is
    // deliberately stuck until someone acts on it. A key that does not match the one
    // sent leads whoever reconciles to find nothing and conclude nothing was created —
    // which is the failure this whole path exists to avoid.
    const sentKey = stripeMock().paymentIntents.create.mock.calls.at(-1)?.[1]?.idempotencyKey;
    const alert = (logger.error as jest.Mock).mock.calls.find(
      ([message]) => typeof message === 'string' && message.includes('needs reconciliation')
    );
    expect(alert).toBeDefined();
    expect(alert?.[1].idempotencyKey).toBe(sentKey);
    expect(alert?.[1].searchIntentsBy).toEqual({ 'metadata.bookingId': booking.id });
  });

  it('treats an unrecognised Stripe failure as unknown rather than cancelling', async () => {
    const { providerAccount, booking } = await startable('hold-unknown-error');

    // Stating what is definitive rather than what is uncertain: an error nobody
    // anticipated must not end a booking by default.
    stripeMock().paymentIntents.create.mockRejectedValueOnce(new Error('something new'));

    await start(booking.id, providerAccount.token).expect(503);

    expect((await reload(booking.id)).status).toBe(BookingStatus.CONFIRMED);
  });

  it('cancels and releases the claim when the card is definitively declined', async () => {
    const { providerAccount, booking } = await startable('hold-declined');

    const cardError = Object.assign(new Error('Your card was declined.'), {
      type: 'StripeCardError',
    });
    stripeMock().paymentIntents.create.mockRejectedValueOnce(cardError);

    await start(booking.id, providerAccount.token).expect(402);

    const after = await reload(booking.id);
    expect(after.status).toBe(BookingStatus.CANCELLED);
    expect(after.holdPlacedAt).toBeNull();
  });

  it('will not record a hold for a price the booking no longer has', async () => {
    const { providerAccount, booking } = await startable('hold-amount-drift');

    // A `confirmed` booking can still be edited, and changing its duration
    // recalculates `totalAmount`. An edit landing while Stripe is answering would
    // otherwise leave a hold for the old price against a booking that now costs
    // something else — and capture would take the wrong amount.
    stripeMock().paymentIntents.create.mockImplementationOnce(async () => {
      await AppDataSource.query(`UPDATE bookings SET "totalAmount" = 400 WHERE id = $1`, [
        booking.id,
      ]);
      return { id: 'pi_test_hold', status: 'requires_capture' };
    });

    await start(booking.id, providerAccount.token).expect(409);

    const after = await reload(booking.id);
    expect(after.status).toBe(BookingStatus.CONFIRMED);
    expect(after.stripePaymentIntentId).toBeNull();

    // The authorisation for the stale price is released rather than left against the
    // customer's card, and the claim is freed so a retry can price it correctly.
    expect(stripeMock().paymentIntents.cancel).toHaveBeenCalledWith('pi_test_hold');
    expect(after.holdPlacedAt).toBeNull();
  });

  it('keeps the claim when the hold it needs to release cannot be released', async () => {
    const { providerAccount, booking } = await startable('hold-release-fails');

    stripeMock().paymentIntents.create.mockImplementationOnce(async () => {
      await AppDataSource.query(`UPDATE bookings SET "totalAmount" = 400 WHERE id = $1`, [
        booking.id,
      ]);
      return { id: 'pi_test_stuck', status: 'requires_capture' };
    });
    stripeMock().paymentIntents.cancel.mockRejectedValueOnce(new Error('Stripe unavailable'));

    await start(booking.id, providerAccount.token).expect(503);

    // Freeing the claim here would invite a retry that authorises the card again while
    // this authorisation may still be standing — the original defect, re-entered
    // through the recovery path.
    expect((await reload(booking.id)).holdPlacedAt).not.toBeNull();

    await start(booking.id, providerAccount.token).expect(409);
    expect(stripeMock().paymentIntents.create).toHaveBeenCalledTimes(1);
  });

  it('does not strand a booking when preparation fails before Stripe is reached', async () => {
    const { providerAccount, booking } = await startable('hold-prep-fails');

    // Anything that throws before the request is made — `getStripeInstance()` on an
    // unconfigured environment is the live example — must not leave a claim behind.
    // The claim is not reversible from an error path, because this handler cannot tell
    // a failure that preceded the request from one that followed it, so the only safe
    // arrangement is for nothing but the request itself to sit after the claim.
    const settings = await import('@/services/PlatformSettingsService');
    const spy = jest
      .spyOn(settings, 'getPlatformCurrency')
      .mockRejectedValueOnce(new Error('settings unavailable'));

    try {
      await start(booking.id, providerAccount.token).expect(500);
    } finally {
      spy.mockRestore();
    }

    // Startable again: no hold can exist, so no claim should either.
    const after = await reload(booking.id);
    expect(after.holdPlacedAt).toBeNull();
    expect(after.status).toBe(BookingStatus.CONFIRMED);

    await start(booking.id, providerAccount.token).expect(200);
  });

  it('still refuses to start a booking that is not startable at all', async () => {
    const { providerAccount, booking } = await startable('hold-completed');
    await AppDataSource.getRepository(Booking).update(
      { id: booking.id },
      { status: BookingStatus.COMPLETED }
    );

    await start(booking.id, providerAccount.token).expect(400);
    expect(stripeMock().paymentIntents.create).not.toHaveBeenCalled();
  });
});
