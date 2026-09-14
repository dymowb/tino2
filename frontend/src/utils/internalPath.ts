/**
 * Validates a stored navigation target before it is used.
 *
 * Notification `actionUrl` is free text on the model and in the data export: the
 * service happens to write relative in-app paths today, but nothing enforces it,
 * and the value reached `window.location.href` unchecked. A row carrying
 * `https://…` or `javascript:…` would then navigate the user off the app or run a
 * script from what looks like an ordinary notification.
 *
 * Only a single-leading-slash, same-origin path is accepted. Everything else —
 * absolute URLs, `//host` and `/\host` protocol-relative forms, any scheme, and
 * embedded control characters — returns null, and the caller falls back to a
 * known-safe route.
 */
export const toInternalPath = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;

  const path = value.trim();
  if (!path.startsWith('/')) return null;

  // `//evil.com` and `/\evil.com` are both protocol-relative to a browser.
  if (path.startsWith('//') || path.startsWith('/\\')) return null;

  // Backslashes and control characters exist here only to smuggle something past
  // this check; a legitimate in-app path never needs either.
  if (path.includes('\\')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;

  return path;
};
