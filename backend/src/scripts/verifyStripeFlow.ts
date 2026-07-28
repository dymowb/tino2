import 'reflect-metadata';
import '@/config/environment';
import { getStripeInstance } from '@/config/stripe';
import logger from '@/config/logger';

/**
 * WS2 verification: drive the escrow money-movement lifecycle against Stripe's
 * test environment with the configured test key — exactly the pattern
 * PaymentService uses (manual-capture hold → capture → refund). Pure Stripe, no
 * app DB mutation. Proves the key + flow work end-to-end.
 */
async function main() {
  const stripe = getStripeInstance();
  logger.info('Stripe initialized OK with configured key');

  // 1. Escrow HOLD: manual-capture PI, confirmed with a test card → requires_capture
  const pi = await stripe.paymentIntents.create({
    amount: 15000,
    currency: 'brl',
    payment_method: 'pm_card_visa',
    capture_method: 'manual',
    confirm: true,
    payment_method_types: ['card'],
    description: 'WS2 escrow verification',
  });
  logger.info(`1) HOLD → PI ${pi.id} status=${pi.status} (expect requires_capture)`);

  // 2. CAPTURE (release escrow on completion)
  const captured = await stripe.paymentIntents.capture(pi.id);
  logger.info(`2) CAPTURE → status=${captured.status} amount_received=${captured.amount_received}`);

  // 3. REFUND (dispute/cancel path)
  const refund = await stripe.refunds.create({
    payment_intent: pi.id,
    reason: 'requested_by_customer',
  });
  logger.info(`3) REFUND → ${refund.id} status=${refund.status} amount=${refund.amount}`);

  // 4. Partial-hold + cancel (uncaptured auth is voided, not charged)
  const pi2 = await stripe.paymentIntents.create({
    amount: 5000,
    currency: 'brl',
    payment_method: 'pm_card_visa',
    capture_method: 'manual',
    confirm: true,
    payment_method_types: ['card'],
    description: 'WS2 cancel verification',
  });
  const canceled = await stripe.paymentIntents.cancel(pi2.id);
  logger.info(`4) CANCEL hold → ${pi2.id} status=${canceled.status} (expect canceled)`);

  const ok =
    pi.status === 'requires_capture' &&
    captured.status === 'succeeded' &&
    refund.status === 'succeeded' &&
    canceled.status === 'canceled';
  logger.info(
    `RESULT: ${ok ? 'PASS ✅ full escrow lifecycle works with the test key' : 'FAIL ❌ unexpected statuses'}`
  );
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  logger.error(
    `Stripe verification failed: type=${err?.type} code=${err?.code} msg=${err?.message}`
  );
  process.exit(1);
});
