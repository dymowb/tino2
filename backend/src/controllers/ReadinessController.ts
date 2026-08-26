import { Response } from 'express';
import { AppDataSource } from '@/config/database';
import { AppSettings } from '@/models/AppSettings';
import logger from '@/config/logger';
import { ApiResponse, AuthenticatedRequest } from '@/types';
import { t } from '@/i18n';
import { AgentWorkflowRun, WorkflowRunStatus } from '@/models/AgentWorkflowRun';
import {
  workflowRepository,
  WorkflowAlreadyRunningError,
} from '@/agents/workflows/shared/WorkflowRepository';
import {
  applyRoleFilter,
  runBookingReadiness,
} from '@/agents/workflows/booking-readiness/coordinator';
import {
  assertEligible,
  authorizeBooking,
  buildSnapshot,
  ReadinessAccessError,
  ReadinessRole,
  snapshotFingerprint,
} from '@/agents/workflows/booking-readiness/snapshot.service';
import {
  READINESS_SUBJECT_TYPE,
  READINESS_WORKFLOW_TYPE,
  ReadinessFreshness,
  ReadinessPlan,
} from '@/agents/workflows/booking-readiness/types';

const FEATURE_FLAG_KEY = 'booking_readiness_enabled';

async function isEnabled(): Promise<boolean> {
  try {
    const row = await AppDataSource.getRepository(AppSettings).findOne({
      where: { key: FEATURE_FLAG_KEY },
    });
    // Absent flag means off — a half-built workflow should not be reachable by default.
    return row?.value === 'true';
  } catch (error) {
    logger.warn('Could not read readiness feature flag', { error });
    return false;
  }
}

export class ReadinessController {
  /** POST /bookings/:bookingId/readiness-runs */
  createRun = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!(await isEnabled())) {
        res.status(404).json({ success: false, message: t(req, 'common.not_found') });
        return;
      }

      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: t(req, 'common.unauthorized') });
        return;
      }

      const { booking, role } = await authorizeBooking(req.params.bookingId, userId);
      assertEligible(booking);

      const { runId, plan, status } = await runBookingReadiness(booking, userId, role);

      const response: ApiResponse = {
        success: true,
        // Just generated from the current snapshot, so freshness is not in doubt.
        data: { runId, status, plan, freshness: 'current', stale: false },
      };
      res.status(201).json(response);
    } catch (error) {
      this.handleError(req, res, error, 'create readiness run');
    }
  };

  /** GET /bookings/:bookingId/readiness-runs/latest */
  getLatest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!(await isEnabled())) {
        res.status(404).json({ success: false, message: t(req, 'common.not_found') });
        return;
      }

      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: t(req, 'common.unauthorized') });
        return;
      }

      const { booking, role } = await authorizeBooking(req.params.bookingId, userId);
      const run = await workflowRepository.findLatest(
        READINESS_WORKFLOW_TYPE,
        READINESS_SUBJECT_TYPE,
        booking.id
      );

      if (!run) {
        res.json({ success: true, data: null });
        return;
      }

      res.json({ success: true, data: await this.present(run, role) });
    } catch (error) {
      this.handleError(req, res, error, 'fetch latest readiness run');
    }
  };

  /** GET /readiness-runs/:runId */
  getById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      if (!(await isEnabled())) {
        res.status(404).json({ success: false, message: t(req, 'common.not_found') });
        return;
      }

      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: t(req, 'common.unauthorized') });
        return;
      }

      const run = await workflowRepository.findById(req.params.runId);
      if (!run || run.workflowType !== READINESS_WORKFLOW_TYPE) {
        res.status(404).json({ success: false, message: t(req, 'common.not_found') });
        return;
      }

      // Authorize against the subject, not the run — a run id must not be a
      // capability that bypasses booking membership.
      const { role } = await authorizeBooking(run.subjectId, userId);
      res.json({ success: true, data: await this.present(run, role) });
    } catch (error) {
      this.handleError(req, res, error, 'fetch readiness run');
    }
  };

  /**
   * Recomputes the fingerprint on read so a plan whose booking has since changed
   * is reported as stale rather than silently presented as current.
   *
   * Failing to compute it is reported as `unknown`, never as `current`: a database
   * or snapshot failure says nothing about whether the booking changed, and
   * treating "I could not check" as "nothing changed" is what let a dependency
   * outage present outdated scope and payment advice as if it were fresh.
   */
  private async present(
    run: AgentWorkflowRun,
    role: ReadinessRole
  ): Promise<{
    runId: string;
    status: WorkflowRunStatus;
    plan: ReadinessPlan | null;
    freshness: ReadinessFreshness;
    stale: boolean;
  }> {
    const plan = (run.output as ReadinessPlan | null) ?? null;
    const freshness = plan ? await this.evaluateFreshness(run) : 'current';

    return {
      runId: run.id,
      status: run.status,
      plan: plan ? applyRoleFilter(plan, role) : null,
      freshness,
      // Retained for clients written against the two-state field. Anything not
      // positively verified as current stays truthy here, so an older client
      // degrades to the warning rather than to false confidence.
      stale: freshness !== 'current',
    };
  }

  private async evaluateFreshness(run: AgentWorkflowRun): Promise<ReadinessFreshness> {
    // A run stored without a fingerprint cannot be compared against anything.
    if (!run.sourceFingerprint) return 'unknown';

    try {
      const booking = await this.loadBooking(run.subjectId);
      // The booking behind the plan is gone, so the plan describes nothing current.
      if (!booking) return 'stale';

      const fingerprint = snapshotFingerprint(await buildSnapshot(booking));
      return fingerprint === run.sourceFingerprint ? 'current' : 'stale';
    } catch (error) {
      logger.warn('Could not evaluate readiness freshness', { runId: run.id, error });
      return 'unknown';
    }
  }

  private async loadBooking(bookingId: string) {
    const { Booking } = await import('@/models/Booking');
    return AppDataSource.getRepository(Booking).findOne({ where: { id: bookingId } });
  }

  private handleError(
    req: AuthenticatedRequest,
    res: Response,
    error: unknown,
    action: string
  ): void {
    if (error instanceof ReadinessAccessError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }
    if (error instanceof WorkflowAlreadyRunningError) {
      // 409 rather than queueing: a second Opus run for the same booking is pure waste.
      res.status(409).json({ success: false, message: error.message });
      return;
    }
    logger.error(`Failed to ${action}`, { error });
    res.status(500).json({ success: false, message: t(req, 'common.internal_error') });
  }
}

export default new ReadinessController();
