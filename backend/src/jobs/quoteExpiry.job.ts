import cron from 'node-cron';
import quoteService from '@/services/QuoteService';
import logger from '@/config/logger';

/**
 * Expires stale quotes and quote requests. The QuoteService methods were always
 * present but were never scheduled — so quotes/requests never auto-expired past
 * their validUntil / expiresAt. This job wires them in.
 */
export async function runQuoteExpiry(): Promise<void> {
  await quoteService.expireOldQuotes();
  await quoteService.expireOldQuoteRequests();
}

// Runs hourly — quote validity windows are short (hours/days), so daily is too coarse.
export function startQuoteExpiryJob(): void {
  cron.schedule('0 * * * *', async () => {
    logger.info('Running quote-expiry job...');
    await runQuoteExpiry();
  });
  logger.info('Quote-expiry cron job scheduled (hourly)');
}
