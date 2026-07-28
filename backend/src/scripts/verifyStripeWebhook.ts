import 'reflect-metadata';
import '@/config/environment';
import http from 'http';
import https from 'https';
import { getStripeInstance } from '@/config/stripe';

/**
 * WS2 webhook verification: sign a synthetic Stripe event with STRIPE_WEBHOOK_SECRET
 * and POST it to the webhook endpoint. A 200 proves signature verification +
 * raw-body handling work (the route's express.raw isn't clobbered by global
 * express.json). Business handlers no-op on a fake PI id — that's fine; we're
 * testing the verification path, not the lookup. Usage: ts-node … <baseUrl>
 */
const base = process.argv[2] || 'http://localhost:3002';

async function main() {
  const stripe = getStripeInstance();
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!secret.startsWith('whsec_')) throw new Error('STRIPE_WEBHOOK_SECRET not set');

  const payload = JSON.stringify({
    id: 'evt_test_ws2',
    object: 'event',
    type: 'payment_intent.succeeded',
    data: {
      object: { id: 'pi_test_ws2_synthetic', object: 'payment_intent', status: 'succeeded' },
    },
  });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });

  const url = new URL(`${base}/api/v1/payments/webhook/stripe`);
  const lib = url.protocol === 'https:' ? https : http;
  const status: number = await new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Stripe-Signature': header,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode || 0);
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });

  // Stripe webhook convention: 200 = received & signature valid. 400 = signature/parse fail.
  console.log(`POST ${url.href} → HTTP ${status}`);
  console.log(
    status === 200
      ? 'PASS ✅ webhook signature verified + raw body intact'
      : `FAIL ❌ (HTTP ${status}) — likely signature/raw-body issue`
  );
  process.exit(status === 200 ? 0 : 1);
}

main().catch((e) => {
  console.error('Webhook verify error:', e?.message || e);
  process.exit(1);
});
