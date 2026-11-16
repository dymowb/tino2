import { Response } from 'express';
import { AppDataSource } from '@/config/database';
import { AppSettings } from '@/models/AppSettings';
import logger from '@/config/logger';
import { ApiResponse, AuthenticatedRequest } from '@/types';
import { getLocale, t } from '@/i18n';
import { AgentWorkflowRun, WorkflowRunStatus } from '@/models/AgentWorkflowRun';
import {
  workflowRepository,
  WorkflowAlreadyRunningError,
  WorkflowBudgetExceededError,
} from '@/agents/workflows/shared/WorkflowRepository';
import {
  applyRoleFilter,
  ReadinessRunResult,
  runBookingReadiness,
} from '@/agents/workflows/booking-readiness/coordinator';
import { draftMessage } from '@/agents/workflows/booking-readiness/agents/communication.agent';
import { draftBudget } from '@/agents/workflows/booking-readiness/draftBudget';
import {
  assertEligible,
  authorizeBooking,
  buildSnapshot,
  planFreshness,
  ReadinessAccessError,
  ReadinessRole,
  snapshotFingerprint,
} from '@/agents/workflows/booking-readiness/snapshot.service';
import {
  READINESS_SCHEMA_VERSION,
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

      // Fingerprint first. A run is only worth paying for when the booking has
      // actually changed since the last one, so an unchanged booking is served
      // its existing plan instead of a second ~25s Opus run that would produce
      // the same answer. Any edit changes the fingerprint and unlocks a new run
      // on its own — there is no cooldown to wait out.
      const snapshot = await buildSnapshot(booking);
      const fingerprint = snapshotFingerprint(snapshot);

      const reusable = await workflowRepository.findReusable(
        READINESS_WORKFLOW_TYPE,
        READINESS_SUBJECT_TYPE,
        booking.id,
        fingerprint,
        READINESS_SCHEMA_VERSION
      );
      if (reusable) {
        res.status(200).json({
          success: true,
          data: { ...(await this.present(reusable, role)), reused: true },
        });
        return;
      }

      const result = await runBookingReadiness(booking, userId, role, snapshot);

      // The snapshot is fingerprinted *before* a multi-second agent run, so the
      // booking can change while the plan is being built. Claiming `current` here
      // because the plan is newly made would report a fingerprint nobody checked —
      // so the freshly stored run goes through the same evaluation as a read.
      //
      // The work is already done and persisted by this point, so nothing after it may
      // fail the request: a 500 here would invite a retry that pays for another Opus
      // run to rebuild a plan that already exists. An unverifiable freshness is
      // reported as `unknown`, which is what the field is for.
      const response: ApiResponse = {
        success: true,
        data: { ...(await this.presentFresh(result, role)), reused: false },
      };
      res.status(201).json(response);
    } catch (error) {
      this.handleError(req, res, error, 'create readiness run');
    }
  };

  /**
   * Reads back a run that has just been persisted, degrading to `unknown` freshness
   * rather than failing the request it completed.
   */
  private async presentFresh(result: ReadinessRunResult, role: ReadinessRole) {
    try {
      const stored = await workflowRepository.findById(result.runId);
      if (stored) return await this.present(stored, role);
      logger.warn('Readiness run could not be read back after completing', {
        runId: result.runId,
      });
    } catch (error) {
      logger.warn('Readiness run could not be read back after completing', {
        runId: result.runId,
        error,
      });
    }

    // The coordinator's own return value, already role-filtered. Its freshness is
    // the one thing that could not be established, so it is reported as `unknown`
    // rather than the request being failed over work that succeeded.
    return {
      runId: result.runId,
      status: result.status,
      plan: result.plan,
      freshness: 'unknown' as ReadinessFreshness,
      stale: true,
      viewerRole: role,
    };
  }

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
   * POST /readiness-runs/:runId/findings/:findingId/draft
   *
   * Writes one message the user may send about one finding. It returns text and
   * nothing else: no conversation is created, no message is stored, nothing is
   * sent. The user takes the draft to the existing composer, edits it, and sends
   * it through the messaging API under their own authority — an agent endpoint
   * that could send would be a write capability nobody granted it.
   */
  draftMessageForFinding = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

      // Authorized against the booking, not the run — the same rule as reading a
      // plan. A run id must not be a capability.
      const { booking, role } = await authorizeBooking(run.subjectId, userId);
      // Same gate as generating a plan. A booking that has since completed or
      // been cancelled has messaging closed (`MESSAGING_CLOSED`), so drafting
      // for it bills a model call to produce text the user cannot send.
      assertEligible(booking);

      // Found among the findings THIS READER may see, so a draft cannot be used
      // to read back a finding the role filter would have hidden.
      const stored = (run.output as ReadinessPlan | null) ?? null;
      const visible = stored ? applyRoleFilter(stored, role).findings : [];
      const finding = visible.find((candidate) => candidate.id === req.params.findingId);
      if (!finding) {
        res.status(404).json({ success: false, message: t(req, 'common.not_found') });
        return;
      }

      // Built before the budget is charged: a database failure here must not
      // cost the user a draft they never got.
      const snapshot = await buildSnapshot(booking);

      // A finding describes the booking as it was when the plan was built. If the
      // booking has changed since, the draft would pair that finding with the
      // current records — asking about a gap already closed, or a price already
      // renegotiated — and bill a model call for it. A missing fingerprint is
      // treated the same way: "could not check" is not "unchanged".
      //
      // New messages alone do not refuse it. The terms the finding was written
      // against are unchanged, the drafter reads the conversation as it stands
      // now, and refusing here meant that sending one message — including a
      // draft this endpoint wrote — hid every other draft until a paid re-run.
      const freshness = planFreshness(run, snapshot);
      if (freshness === 'stale') {
        res.status(409).json({
          success: false,
          message: t(req, 'readiness.draft_stale'),
          error: t(req, 'readiness.draft_stale'),
        });
        return;
      }

      // Charged here, after every check above has had its chance to refuse, so
      // only a request that is about to spend a model call counts.
      const refusal = draftBudget.claim(userId);
      if (refusal) {
        if (refusal.scope === 'platform') {
          logger.error('Agent draft budget exhausted platform-wide', {
            retryAfterSeconds: refusal.retryAfterSeconds,
            alert: 'agent_budget_exhausted',
          });
        } else {
          logger.warn('Agent draft budget exhausted for user', {
            retryAfterSeconds: refusal.retryAfterSeconds,
          });
        }
        res.setHeader('Retry-After', String(refusal.retryAfterSeconds));
        const text = t(
          req,
          refusal.scope === 'platform'
            ? 'readiness.draft_budget_platform'
            : 'readiness.draft_budget_user'
        );
        // Both fields, like the route limiters: the drawer reads `message`, the
        // client's response interceptor toasts `error`.
        res.status(429).json({ success: false, message: text, error: text });
        return;
      }

      const draft = await draftMessage(
        snapshot,
        finding,
        role,
        getLocale(req),
        undefined,
        freshness === 'messages_changed'
      );
      if (!draft) {
        res.status(503).json({ success: false, message: t(req, 'readiness.draft_unavailable') });
        return;
      }

      res.json({ success: true, data: draft });
    } catch (error) {
      this.handleError(req, res, error, 'draft a message for a readiness finding');
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
    viewerRole: ReadinessRole;
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
      // The reader's own role on this booking. Not a secret from them — it is
      // what lets the drawer say "needs your answer" instead of naming a role
      // the reader then has to map back to themselves.
      viewerRole: role,
    };
  }

  private async evaluateFreshness(run: AgentWorkflowRun): Promise<ReadinessFreshness> {
    // A run stored without a fingerprint cannot be compared against anything.
    if (!run.sourceFingerprint) return 'unknown';

    try {
      const booking = await this.loadBooking(run.subjectId);
      // The booking behind the plan is gone, so the plan describes nothing current.
      if (!booking) return 'stale';

      return planFreshness(run, await buildSnapshot(booking));
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
    if (error instanceof WorkflowBudgetExceededError) {
      if (error.scope === 'global') {
        // The platform ceiling is an operational condition, not a user error:
        // every account is affected and somebody has to decide whether to raise
        // it. It is logged at error level so it reaches alerting.
        logger.error('Agent run budget exhausted platform-wide', {
          workflowType: READINESS_WORKFLOW_TYPE,
          retryAfterSeconds: error.retryAfterSeconds,
          alert: 'agent_budget_exhausted',
        });
      } else {
        logger.warn('Agent run budget exhausted for user', {
          workflowType: READINESS_WORKFLOW_TYPE,
          retryAfterSeconds: error.retryAfterSeconds,
        });
      }

      const message = t(
        req,
        error.scope === 'global'
          ? 'readiness.budget_exhausted_platform'
          : 'readiness.budget_exhausted_user'
      );

      res.setHeader('Retry-After', String(error.retryAfterSeconds));
      res.status(429).json({
        success: false,
        message,
        // Also as `error`, which is the field the client's response interceptor
        // reads when it raises a toast. Without it the interceptor falls back to
        // axios' own "Request failed with status code 429" — English, in a
        // Portuguese session, next to the localized text this endpoint returned.
        error: message,
        retryAfterSeconds: error.retryAfterSeconds,
      });
      return;
    }
    logger.error(`Failed to ${action}`, { error });
    res.status(500).json({ success: false, message: t(req, 'common.internal_error') });
  }
}

export default new ReadinessController();
