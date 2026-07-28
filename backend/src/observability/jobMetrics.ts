import logger from '@/config/logger';

export interface JobResult {
  job: string;
  success: boolean;
  durationMs: number;
  processed?: number;
}

const latest = new Map<string, JobResult & { completedAt: string }>();

export async function instrumentJob<T>(
  job: string,
  operation: () => Promise<T>,
  processed?: (result: T) => number
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await operation();
    const metric = {
      job,
      success: true,
      durationMs: Date.now() - startedAt,
      processed: processed?.(result),
      completedAt: new Date().toISOString(),
    };
    latest.set(job, metric);
    logger.info('background_job_completed', metric);
    return result;
  } catch (error) {
    const metric = {
      job,
      success: false,
      durationMs: Date.now() - startedAt,
      completedAt: new Date().toISOString(),
    };
    latest.set(job, metric);
    logger.error('background_job_failed', { ...metric, error });
    throw error;
  }
}

export function getJobMetrics(): Record<string, JobResult & { completedAt: string }> {
  return Object.fromEntries(latest);
}
