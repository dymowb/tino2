/**
 * One canonical form for an email address, used everywhere an address is stored
 * or looked up.
 *
 * An address is a single identity however it was typed. PostgreSQL's ordinary
 * `varchar` comparison is not: `User@example.com` and `user@example.com` are two
 * different strings, so without canonicalization they register as two accounts,
 * and whether login or password recovery finds yours depends on how you
 * capitalised it that day.
 *
 * Only case and surrounding whitespace are normalised. The local part of an
 * address is, by RFC 5321, case-sensitive and owned by the receiving server, so
 * lowercasing it is already a small assumption — a safe one in practice, since
 * no mainstream provider treats it otherwise, and one every large service makes.
 * Going further is not safe: stripping dots or `+tags` would merge addresses
 * that some providers deliver to different people.
 */
export function canonicalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
