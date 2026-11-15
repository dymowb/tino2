import config from '@/config/environment';
import { DraftBudget, assertDraftLimits } from '@/agents/workflows/booking-readiness/draftBudget';

/**
 * The daily ceiling on message drafts. The per-account cap sits below the
 * platform one so that no single account can spend everyone's allowance; the
 * route limiter it replaces allowed one account 3,840 requests a day against a
 * 2,000 platform ceiling, refusals included.
 */
describe('the draft budget', () => {
  const HOUR = 60 * 60 * 1000;
  const make = (now: { t: number }) =>
    new DraftBudget(
      { perUserMax: 2, perUserWindowMs: 24 * HOUR, globalMax: 3, globalWindowMs: 24 * HOUR },
      () => now.t
    );

  it('stops one account at its own cap, before it reaches the platform ceiling', () => {
    const budget = make({ t: 0 });
    expect(budget.claim('a')).toBeNull();
    expect(budget.claim('a')).toBeNull();
    expect(budget.claim('a')).toEqual({ scope: 'user', retryAfterSeconds: 24 * 3600 });
    // The refused claim spent nothing: another account still has the platform's last draft.
    expect(budget.claim('b')).toBeNull();
  });

  it('shares the platform ceiling across accounts', () => {
    const budget = make({ t: 0 });
    budget.claim('a');
    budget.claim('b');
    budget.claim('c');
    expect(budget.claim('d')).toEqual({ scope: 'platform', retryAfterSeconds: 24 * 3600 });
  });

  it('tells an account it is out of its own allowance, not that the platform is', () => {
    const budget = make({ t: 0 });
    budget.claim('a');
    budget.claim('a');
    budget.claim('b');
    expect(budget.claim('a')?.scope).toBe('user');
  });

  it('opens again when the window ends', () => {
    const now = { t: 0 };
    const budget = make(now);
    budget.claim('a');
    budget.claim('a');
    now.t = 23 * HOUR;
    expect(budget.claim('a')?.retryAfterSeconds).toBe(3600);
    now.t = 24 * HOUR;
    expect(budget.claim('a')).toBeNull();
  });
});

describe('the configured draft limits', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('ship with a per-account allowance one account cannot use to drain the platform', () => {
    // Pins the defaults, not just the class: reverting them to a per-user cap
    // above the platform ceiling would otherwise leave the suite green.
    expect(() =>
      assertDraftLimits({
        perUserMax: config.agentBudget.perUserMaxDrafts,
        perUserWindowMs: config.agentBudget.perUserWindowMs,
        globalMax: config.agentBudget.globalMaxDrafts,
        globalWindowMs: config.agentBudget.globalWindowMs,
      })
    ).not.toThrow();
  });

  it('refuses a per-user cap that would let one account drain the platform', () => {
    expect(() =>
      assertDraftLimits({
        perUserMax: 1000,
        perUserWindowMs: DAY,
        globalMax: 2000,
        globalWindowMs: DAY,
      })
    ).toThrow(/misconfigured/);
  });

  it('counts a shorter per-user window as more allowance', () => {
    // 100 per hour is 2,400+ a day, whatever the per-window number says.
    expect(() =>
      assertDraftLimits({
        perUserMax: 100,
        perUserWindowMs: DAY / 24,
        globalMax: 2000,
        globalWindowMs: DAY,
      })
    ).toThrow(/misconfigured/);
  });
});
