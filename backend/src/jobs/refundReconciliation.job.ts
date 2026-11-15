import cron from 'node-cron';
import logger from '@/config/logger';
import { instrumentJob } from '@/observability/jobMetrics';
import PaymentService from '@/services/PaymentService';

export async function runRefundReconciliation(): Promise<number> {
  return PaymentService.reconcileRefundOperations();
}

export function startRefundReconciliationJob(): void {
  cron.schedule('* * * * *', async () => {
    await instrumentJob('refund-reconciliation', runRefundReconciliation, (count) => count).catch(
      (error) => logger.error('Refund reconciliation job failed', { error })
    );
  });
  logger.info('Refund-reconciliation cron job scheduled (every minute)');
}
