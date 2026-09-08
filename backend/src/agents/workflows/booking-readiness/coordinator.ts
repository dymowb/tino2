import config from '@/config/environment';
import logger from '@/config/logger';
import { Booking } from '@/models/Booking';
import { WorkflowRunStatus } from '@/models/AgentWorkflowRun';
import { WorkflowRunner, WorkflowStage } from '../shared/WorkflowRunner';
import { WorkflowBudget, workflowRepository } from '../shared/WorkflowRepository';
import { runLogisticsAgent } from './agents/logistics.agent';
import { runScopeAgent } from './agents/scope.agent';
import { buildSnapshot, snapshotFingerprint } from './snapshot.service';
import {
  buildVerification,
  computeReadiness,
  filterForRole,
  semanticReview,
  validateChecklist,
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
/** Shorter than Scope's: a smaller prompt on the fast chain. Still generous
 * enough that a slow-but-valid call is not abandoned. */
const LOGISTICS_TIMEOUT_MS = 60_000;
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
      customerChecklist: result.state.customerChecklist ?? [],
      providerChecklist: result.state.providerChecklist ?? [],
      findings,
      verification: result.state.verification ?? buildVerification([], false),
      generatedAt: new Date().toISOString(),
      unavailableSections,
    };

    // Keyed on `unavailableSections`, not on `degraded`.
    //
    // `degraded` counts only *required* stages, which is right for the readiness
    // rollup — an optional stage failing should not force `incomplete`. It is
    // wrong for the stored status. Before BR-2 every stage was required, so
    // `completed` could only mean all of them succeeded; `logistics` is the first
    // optional one, and without this a run that lost its checklists would still
    // be written as `completed` — which MN5's `findReusable` matches on. Every
    // later request for an unchanged booking would then be served that
    // checklist-less plan as `reused`, and the Re-run button could never produce
    // checklists again until someone edited the booking.
    const status = result.failed
      ? WorkflowRunStatus.FAILED
      : result.degraded || unavailableSections.length > 0
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

export function buildStages(
  snapshot: ReadinessSnapshot
): WorkflowStage<ReadinessWorkflowState>[][] {
  return [
    // One group, so the two run concurrently. They read the same immutable
    // snapshot and write disjoint parts of the state, so neither can see a
    // half-finished result from the other.
    //
    // Only `scope` is required. Logistics failing costs the reader their
    // checklists — the run reports that through `unavailableSections` — whereas
    // scope failing leaves nothing worth showing at all.
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
      {
        name: 'logistics',
        required: false,
        timeoutMs: LOGISTICS_TIMEOUT_MS,
        run: async (_state, signal) => {
          const { output } = await runLogisticsAgent(snapshot, signal, LOGISTICS_TIMEOUT_MS);
          return { logistics: output };
        },
      },
    ],
    [
      {
        name: 'verification',
        required: true,
        timeoutMs: VERIFY_TIMEOUT_MS,
        run: async (state, signal) => {
          // Both agents' findings go through one validation pass, so a claim
          // made by each is deduplicated against the other rather than shown
          // twice in different words.
          const { findings, dropReasons } = validateFindings(
            [...(state.scope?.findings ?? []), ...(state.logistics?.findings ?? [])],
            state.snapshot
          );
          const customer = validateChecklist(
            state.logistics?.customerChecklist ?? [],
            state.snapshot
          );
          const provider = validateChecklist(
            state.logistics?.providerChecklist ?? [],
            state.snapshot
          );

          // Both checklists go through the semantic pass with the findings, in a
          // single call, then are split back apart by role.
          const review = await semanticReview(
            findings,
            [...customer.items, ...provider.items],
            state.snapshot,
            signal,
            VERIFY_TIMEOUT_MS
          );
          const keptIds = new Set(review.keptChecklist.map((item) => item.id));

          return {
            verifiedFindings: review.kept,
            customerChecklist: customer.items.filter((item) => keptIds.has(item.id)),
            providerChecklist: provider.items.filter((item) => keptIds.has(item.id)),
            verification: buildVerification(
              [
                ...dropReasons,
                ...customer.dropReasons,
                ...provider.dropReasons,
                ...review.dropReasons,
              ],
              review.ran
            ),
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
    // The other role's checklist is emptied, not merely hidden by the UI. It can
    // name things the reader has no business seeing — a provider's preparation
    // step may quote a customer_only access instruction — and a plan is stored
    // once and served to both participants, so the narrowing has to happen here,
    // on the way out, rather than being left to whoever renders it.
    customerChecklist: role === 'customer' ? plan.customerChecklist : [],
    providerChecklist: role === 'provider' ? plan.providerChecklist : [],
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
