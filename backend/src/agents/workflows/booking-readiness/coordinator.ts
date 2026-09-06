import config from '@/config/environment';
import logger from '@/config/logger';
import { Booking } from '@/models/Booking';
import { WorkflowRunStatus } from '@/models/AgentWorkflowRun';
import { WorkflowRunner, WorkflowStage } from '../shared/WorkflowRunner';
import { WorkflowBudget, workflowRepository } from '../shared/WorkflowRepository';
import { runScopeAgent } from './agents/scope.agent';
import { buildSnapshot, snapshotFingerprint } from './snapshot.service';
import {
  buildVerification,
  computeReadiness,
  filterForRole,
  semanticReview,
  validateFindings,
} from './verification';
import {
  READINESS_SCHEMA_VERSION,
  READINESS_SUBJECT_TYPE,
  READINESS_WORKFLOW_TYPE,
  ReadinessPlan,
  ReadinessSnapshot,
  ReadinessWorkflowState,
} from './types';

const SCOPE_TIMEOUT_MS = 90_000;
const VERIFY_TIMEOUT_MS = 45_000;

/**
 * What one account, and the platform, may spend on readiness runs.
 *
 * Every run is a multi-agent reasoning-profile (Opus) call taking ~25s. The
 * global API limiter is 100 requests per 15 minutes across all traffic, which is
 * a ceiling on request volume, not on cost: one authenticated account could
 * spend against it all day. These are the cost ceilings.
 */
export const READINESS_BUDGET: WorkflowBudget = {
  perUserMaxRuns: config.agentBudget.perUserMaxRuns,
  perUserWindowMs: config.agentBudget.perUserWindowMs,
  globalMaxRuns: config.agentBudget.globalMaxRuns,
  globalWindowMs: config.agentBudget.globalWindowMs,
};

export interface ReadinessRunResult {
  runId: string;
  plan: ReadinessPlan;
  status: WorkflowRunStatus;
}

/**
 * Builds and persists a readiness plan for one booking.
 *
 * The coordinator owns sequencing and persistence; it does not decide anything
 * a user sees. Readiness level, evidence validity and role visibility are all
 * computed deterministically after the agents have had their say.
 */
export async function runBookingReadiness(
  booking: Booking,
  initiatedBy: string,
  role: 'customer' | 'provider',
  // The caller has usually already built the snapshot in order to look for a
  // reusable run. Reusing it here keeps the fingerprint the plan is stored under
  // identical to the one that was searched for, so a run cannot be written under
  // a fingerprint nobody checked against.
  prebuiltSnapshot?: ReadinessSnapshot
): Promise<ReadinessRunResult> {
  const snapshot = prebuiltSnapshot ?? (await buildSnapshot(booking));
  const sourceFingerprint = snapshotFingerprint(snapshot);

  // Claimed before any model is called, and released by `complete`/`fail`.
  const run = await workflowRepository.createRunning({
    workflowType: READINESS_WORKFLOW_TYPE,
    subjectType: READINESS_SUBJECT_TYPE,
    subjectId: booking.id,
    initiatedBy,
    schemaVersion: READINESS_SCHEMA_VERSION,
    budget: READINESS_BUDGET,
  });

  try {
    const stages = buildStages(snapshot);
    const runner = new WorkflowRunner<ReadinessWorkflowState>(stages);
    const result = await runner.run({ snapshot });

    const unavailableSections = result.outcomes
      .filter((outcome) => outcome.status !== 'succeeded')
      .map((outcome) => outcome.stage);

    const findings = result.state.verifiedFindings ?? [];
    const plan: ReadinessPlan = {
      bookingId: booking.id,
      sourceFingerprint,
      readiness: computeReadiness(findings, result.degraded),
      agreedScope: result.state.scope?.agreedScope ?? [],
      exclusions: result.state.scope?.exclusions ?? [],
      findings,
      verification: result.state.verification ?? buildVerification([], false),
      generatedAt: new Date().toISOString(),
      unavailableSections,
    };

    const status = result.failed
      ? WorkflowRunStatus.FAILED
      : result.degraded
        ? WorkflowRunStatus.FAILED_PARTIAL
        : WorkflowRunStatus.COMPLETED;

    await workflowRepository.complete(run.id, {
      status,
      sourceFingerprint,
      // Stored unfiltered; the role filter is applied per reader on the way out,
      // so both participants can be served from one run.
      output: plan,
      stageOutcomes: result.outcomes,
      errorSummary: result.outcomes.find((outcome) => outcome.error)?.error ?? null,
      durationMs: result.durationMs,
      inputTokens: sumTokens(result.outcomes, 'inputTokens'),
      outputTokens: sumTokens(result.outcomes, 'outputTokens'),
    });

    logger.info('Booking readiness run finished', {
      runId: run.id,
      bookingId: booking.id,
      status,
      readiness: plan.readiness,
      findings: plan.findings.length,
    });

    return { runId: run.id, plan: applyRoleFilter(plan, role), status };
  } catch (error) {
    // Always release the in-flight slot, or the booking is locked out of future runs.
    const message = error instanceof Error ? error.message : String(error);
    await workflowRepository.fail(run.id, message);
    throw error;
  }
}

function buildStages(snapshot: ReadinessSnapshot): WorkflowStage<ReadinessWorkflowState>[][] {
  return [
    [
      {
        name: 'scope',
        required: true,
        timeoutMs: SCOPE_TIMEOUT_MS,
        run: async (_state, signal) => {
          const { output } = await runScopeAgent(snapshot, signal, SCOPE_TIMEOUT_MS);
          return { scope: output };
        },
      },
    ],
    [
      {
        name: 'verification',
        required: true,
        timeoutMs: VERIFY_TIMEOUT_MS,
        run: async (state, signal) => {
          const { findings, dropReasons } = validateFindings(
            state.scope?.findings ?? [],
            state.snapshot
          );
          const review = await semanticReview(findings, state.snapshot, signal, VERIFY_TIMEOUT_MS);
          return {
            verifiedFindings: review.kept,
            verification: buildVerification([...dropReasons, ...review.dropReasons], review.ran),
          };
        },
      },
    ],
  ];
}

/** Private findings never cross roles, including in the API response. */
export function applyRoleFilter(plan: ReadinessPlan, role: 'customer' | 'provider'): ReadinessPlan {
  const findings = filterForRole(plan.findings, role);
  return {
    ...plan,
    findings,
    verification: {
      ...plan.verification,
      // dropReasons quote the rejected finding's text, so a dropped
      // customer_only/provider_only statement would reach the opposite role
      // through this field even though the finding itself was filtered out.
      // The count is all a participant needs; the reasons stay in the stored run.
      dropReasons: undefined,
    },
    // Recompute so a hidden blocking finding cannot leak through the headline.
    readiness: computeReadiness(findings, plan.readiness === 'incomplete'),
  };
}

function sumTokens(
  outcomes: Array<{ inputTokens?: number; outputTokens?: number }>,
  key: 'inputTokens' | 'outputTokens'
): number {
  return outcomes.reduce((total, outcome) => total + (outcome[key] ?? 0), 0);
}
