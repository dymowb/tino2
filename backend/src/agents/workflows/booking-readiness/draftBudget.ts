import config from '@/config/environment';

/**
 * Daily cost ceiling on message drafts: per account, and platform-wide.
 *
 * Charged by the controller immediately before the model call, after every
 * check that can refuse the request, so a 400, 404 or 409 costs nothing. A
 * rate limiter mounted on the route cannot do that: it counts requests before
 * the controller has decided whether they reach a model, which let one account
 * drain the platform's allowance with requests that never spent a cent and
 * then switch drafting off for everyone.
 *
 * The per-account cap sits well below the platform one for the same reason
 * MN5's run budget does (10 against 200): no single account can spend the
 * shared allowance on its own.
 *
 * In memory and per process, unlike the run budget's database count. Drafts
 * leave no row to count, and one process is what production runs. A restart
 * resets the counts, which errs towards allowing a little more, never towards
 * running without a bound.
 */

export type DraftBudgetRefusal = { scope: 'user' | 'platform'; retryAfterSeconds: number };

type Window = { count: number; resetsAt: number };

export class DraftBudget {
  private readonly perUser = new Map<string, Window>();
  private platform: Window = { count: 0, resetsAt: 0 };

  constructor(
    private readonly limits: {
      perUserMax: number;
      perUserWindowMs: number;
      globalMax: number;
      globalWindowMs: number;
    },
    private readonly now: () => number = Date.now
  ) {}

  /** Takes one draft from both allowances, or neither. */
  claim(userId: string): DraftBudgetRefusal | null {
    const now = this.now();
    const user = this.current(this.perUser.get(userId), this.limits.perUserWindowMs, now);
    this.platform = this.current(this.platform, this.limits.globalWindowMs, now);

    // The account is checked first: one that is out of its own allowance must
    // be told so, not told the platform is down.
    if (user.count >= this.limits.perUserMax) {
      this.perUser.set(userId, user);
      return { scope: 'user', retryAfterSeconds: secondsUntil(user.resetsAt, now) };
    }
    if (this.platform.count >= this.limits.globalMax) {
      this.perUser.set(userId, user);
      return { scope: 'platform', retryAfterSeconds: secondsUntil(this.platform.resetsAt, now) };
    }

    user.count += 1;
    this.platform.count += 1;
    this.perUser.set(userId, user);
    this.prune(now);
    return null;
  }

  private current(window: Window | undefined, windowMs: number, now: number): Window {
    return window && window.resetsAt > now ? window : { count: 0, resetsAt: now + windowMs };
  }

  /** Expired windows would otherwise accumulate one entry per account forever. */
  private prune(now: number): void {
    if (this.perUser.size < 10_000) return;
    for (const [id, window] of this.perUser) {
      if (window.resetsAt <= now) this.perUser.delete(id);
    }
  }
}

function secondsUntil(at: number, now: number): number {
  return Math.max(1, Math.ceil((at - now) / 1000));
}

export type DraftLimits = ConstructorParameters<typeof DraftBudget>[0];

/**
 * The property the whole design rests on: within one platform window, a single
 * account cannot spend the platform's allowance. A per-user window shorter
 * than the platform's multiplies what one account gets, so it is counted.
 * Thrown at boot, because a misconfiguration here is the exact hole this
 * budget was written to close.
 */
export function assertDraftLimits(limits: DraftLimits): DraftLimits {
  // +1: fixed windows anchored at first use, so one account can straddle a
  // boundary and get one window more than the ratio suggests.
  const userWindowsPerPlatformWindow =
    Math.ceil(limits.globalWindowMs / limits.perUserWindowMs) + 1;
  if (limits.perUserMax * userWindowsPerPlatformWindow >= limits.globalMax) {
    throw new Error(
      `Draft budget misconfigured: one account could spend the platform allowance ` +
        `(${limits.perUserMax} × ${userWindowsPerPlatformWindow} windows ≥ ${limits.globalMax}). ` +
        `Lower AGENT_BUDGET_PER_USER_MAX_DRAFTS or raise AGENT_BUDGET_GLOBAL_MAX_DRAFTS. ` +
        `Note AGENT_BUDGET_PER_USER_WINDOW_MS is shared with the run budget: shortening it ` +
        `for runs also multiplies each account's daily drafts.`
    );
  }
  return limits;
}

export const draftBudget = new DraftBudget(
  assertDraftLimits({
    perUserMax: config.agentBudget.perUserMaxDrafts,
    perUserWindowMs: config.agentBudget.perUserWindowMs,
    globalMax: config.agentBudget.globalMaxDrafts,
    globalWindowMs: config.agentBudget.globalWindowMs,
  })
);
