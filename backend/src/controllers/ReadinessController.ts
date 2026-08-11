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
        data: { runId, status, plan, stale: false },
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
   */
  private async present(
    run: AgentWorkflowRun,
    role: ReadinessRole
  ): Promise<{
    runId: string;
    status: WorkflowRunStatus;
    plan: ReadinessPlan | null;
    stale: boolean;
  }> {
    const plan = (run.output as ReadinessPlan | null) ?? null;
    let stale = false;

    if (plan && run.sourceFingerprint) {
      try {
        const { booking } = { booking: await this.loadBooking(run.subjectId) };
        if (booking) {
          stale = snapshotFingerprint(await buildSnapshot(booking)) !== run.sourceFingerprint;
        }
      } catch (error) {
        logger.warn('Could not evaluate readiness staleness', { runId: run.id, error });
      }
    }

    return {
      runId: run.id,
      status: run.status,
      plan: plan ? applyRoleFilter(plan, role) : null,
      stale,
    };
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
