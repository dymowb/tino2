/**
 * Carries a drafted message from the readiness drawer to the message composer.
 *
 * Through sessionStorage rather than the URL: a draft is a sentence the user is
 * about to send to another person, and a query string is the one place it would
 * be written down — browser history, server logs, a shared link. It is also
 * long enough to make an ugly URL.
 *
 * Keyed by booking so a draft written for one conversation cannot surface in
 * another, and read once: the composer takes it and clears it, so going back to
 * Messages later does not re-fill a draft that was already used or abandoned.
 */
const KEY = "tino.messageDraft";

export function stashMessageDraft(bookingId: string, body: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ bookingId, body }));
  } catch {
    // Private mode, or storage disabled. The composer simply opens empty — the
    // user still has the draft on screen behind them.
  }
}

/** Returns the draft for this booking and forgets it. */
export function takeMessageDraft(
  bookingId: string | null | undefined,
): string | null {
  if (!bookingId) return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const stash = JSON.parse(raw) as { bookingId?: string; body?: string };
    if (stash?.bookingId !== bookingId || typeof stash.body !== "string")
      return null;
    sessionStorage.removeItem(KEY);
    return stash.body;
  } catch {
    return null;
  }
}
