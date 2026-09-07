import { MigrationInterface, QueryRunner } from 'typeorm';

/** Written into `suspensionComment` on every renamed row, and the key `down()`
 * matches on. Deliberately unmistakable: it must not appear in operator notes. */
const MARKER = '[CanonicalizeUserEmail1781500000000]';

/**
 * Makes an email address one identity, and makes the database say so.
 *
 * Two separate defects, with one fix:
 *
 * 1. Every lookup compared the address as typed. PostgreSQL's `varchar`
 *    comparison is case-sensitive, so `User@example.com` and `user@example.com`
 *    were two accounts, and whether login or password recovery found yours
 *    depended on how you capitalised it.
 * 2. **There was no uniqueness at all.** `InitialSchema` creates the table with
 *    `CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email")` and then, in
 *    the same `up()`, runs
 *    `ALTER TABLE "users" DROP CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3"`
 *    (`1777158117672-InitialSchema.ts:149`). Not a rollback, not a later
 *    migration — it drops its own constraint on the way in, so *no* database has
 *    ever had it, fresh or otherwise. Registration's guard is a read-then-insert
 *    with nothing behind it, and the shared database already holds four pairs of
 *    byte-identical duplicate addresses written 0.2ms apart by concurrent
 *    requests. The race is not theoretical; it has already fired.
 *
 * The index is on `lower(btrim(email))` rather than on `email`. Storing canonical
 * addresses is what the application does; the expression index is what makes it
 * true regardless — a future code path that forgets to canonicalise is rejected
 * by the database instead of quietly creating a second account.
 */
export class CanonicalizeUserEmail1781500000000 implements MigrationInterface {
  name = 'CanonicalizeUserEmail1781500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Collisions must go before canonicalising, because canonicalising is what
    // turns two distinct strings into the same one.
    //
    // The keeper is the oldest account. `lastLogin` leads the ordering because
    // it is the better answer where it exists, but nothing in this codebase ever
    // writes that column (`UserService.ts:325` says so, and all 1461 rows in the
    // shared database are null), so in practice `createdAt ASC` decides.
    //
    // Losers are renamed rather than deleted, to a form that carries the
    // original address inside it, and deactivated — an account whose address now
    // has a suffix cannot be logged into, and saying so in `isActive` is more
    // honest than leaving it apparently live.
    //
    // The suffix records whether *this migration* did the deactivating:
    // `+dup-` for a row that was active and is not any more, `+dupx-` for one
    // that was already inactive. `down()` reads that back, so a rollback cannot
    // silently reactivate an account somebody had suspended on purpose.
    const losers: Array<{ id: string; email: string; isActive: boolean }> =
      await queryRunner.query(`
        WITH ranked AS (
          SELECT id, email, "isActive",
                 row_number() OVER (
                   PARTITION BY lower(btrim(email))
                   ORDER BY "lastLogin" DESC NULLS LAST, "createdAt" ASC, id ASC
                 ) AS rn
            FROM users
        )
        SELECT id, email, "isActive" FROM ranked WHERE rn > 1
         ORDER BY lower(btrim(email)), id
      `);

    // Renamed one row at a time rather than in a single statement, because the
    // replacement address has to be *checked* rather than assumed free.
    //
    // `<local>+dup-<8 hex>@<domain>` is a perfectly ordinary address that a real
    // account may already hold — the tests plant exactly that shape. Generating
    // it blindly and only finding out at `CREATE UNIQUE INDEX` means the whole
    // migration aborts, during the deploy window, for a reason the operator then
    // has to reverse-engineer. Each candidate is therefore tested against the
    // table as it stands, including rows renamed moments earlier in this loop,
    // and widened until it is genuinely free.
    for (const loser of losers) {
      const address = await this.freeReplacementFor(queryRunner, loser);

      await queryRunner.query(
        `UPDATE users
            SET email = $2,
                "isActive" = false,
                -- Never overwrite an existing suspension: a row may already be
                -- suspended for a real reason, and that reason outranks this.
                -- Only claimed for a row this migration actually deactivated.
                "suspensionReason" =
                  CASE WHEN $3::boolean
                       THEN COALESCE("suspensionReason", 'duplicate_email')
                       ELSE "suspensionReason" END,
                -- Appended, never substituted: an existing comment is real
                -- operator notes and must survive. The bracketed tag is what
                -- down() matches on, so a rollback touches only rows this
                -- migration actually wrote -- an address a user legitimately
                -- owns that merely looks suffixed is left alone. The sentence
                -- states which action was actually taken, and only that one.
                "suspensionComment" =
                  COALESCE("suspensionComment" || E'\n', '')
                  || $4 || ' Original address: ' || $5 || '. '
                  || CASE WHEN $3::boolean
                          THEN 'Deactivated by this migration because it collided, ignoring case, '
                               || 'with another account. Reversible: see the migration''s down().'
                          ELSE 'This account was already inactive; the migration only renamed it.'
                     END
          WHERE id = $1`,
        [loser.id, address, loser.isActive, MARKER, loser.email]
      );

      // Rewriting somebody's address is not something to do silently.
      // eslint-disable-next-line no-console
      console.warn(
        `[CanonicalizeUserEmail] duplicate address "${loser.email}" -> "${address}" (user ${loser.id}, ${loser.isActive ? 'deactivated' : 'already inactive'})`
      );
    }

    await queryRunner.query(
      `UPDATE users SET email = lower(btrim(email)) WHERE email <> lower(btrim(email))`
    );

    // `lower(btrim(...))`, not `lower(...)`: the same expression the collision
    // partition above uses, and the same normalisation `canonicalizeEmail()`
    // applies. An index on `lower(email)` alone would let ' bob@x.com' and
    // 'bob@x.com' coexist — covering the case half of the canonical form and not
    // the whitespace half, so the backstop would be narrower than the rule it
    // exists to enforce.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_email_lower" ON "users" (lower(btrim("email")))`
    );
  }

  /**
   * A replacement address for a duplicate, verified free rather than assumed.
   *
   * The suffix starts at eight hex characters of the row's own id and widens
   * through the remaining twenty-four before falling back to a counter. Widening
   * keeps the result matching `+dupx?-[0-9a-f]{8,}`, which is what `down()`
   * recognises, so a widened address still round-trips.
   *
   * Two candidates can never be produced for one row, and the check runs against
   * live table state, so a candidate cannot collide with an earlier rename in the
   * same loop either.
   */
  private async freeReplacementFor(
    queryRunner: QueryRunner,
    loser: { id: string; email: string; isActive: boolean }
  ): Promise<string> {
    const hex = loser.id.replace(/-/g, '');
    const tag = loser.isActive ? '+dup-' : '+dupx-';

    // Ordinary address: tag the local part, which keeps the result a valid
    // address and the original recoverable. Anything else is not something this
    // can safely take apart, so the suffix goes on the end verbatim.
    const build = (suffix: string): string =>
      /^[^@]+@[^@]+$/.test(loser.email)
        ? `${loser.email.slice(0, loser.email.indexOf('@'))}${tag}${suffix}@${loser.email.slice(loser.email.indexOf('@') + 1)}`
        : `${loser.email}${tag}${suffix}`;

    const candidates: string[] = [];
    for (let length = 8; length <= hex.length; length += 4) {
      candidates.push(build(hex.slice(0, length)));
    }

    for (const candidate of candidates) {
      if (await this.isAddressFree(queryRunner, candidate)) return candidate;
    }

    // Every prefix of a random uuid taken; the table would have to have been
    // constructed to defeat this. Kept in hex so `down()` still matches.
    for (let counter = 0; ; counter += 1) {
      const candidate = build(`${hex}${counter.toString(16)}`);
      if (await this.isAddressFree(queryRunner, candidate)) return candidate;
    }
  }

  /** Free under the same expression the unique index will be built on. */
  private async isAddressFree(queryRunner: QueryRunner, address: string): Promise<boolean> {
    const rows = await queryRunner.query(
      `SELECT 1 FROM users WHERE lower(btrim(email)) = lower(btrim($1)) LIMIT 1`,
      [address]
    );
    return rows.length === 0;
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_email_lower"`);

    // Restore exactly the rows this migration wrote, and nothing else.
    //
    // Matched on the comment tag rather than on the address suffix alone: a
    // suffix match would also rewrite an address a user legitimately owns —
    // 'bob+dup-deadbeef@example.com' is a perfectly valid plus-tagged address,
    // and rewriting it to 'bob@example.com' (after this method has just dropped
    // the unique index) could silently create the very duplicate the migration
    // existed to prevent. Nor is the suspension *reason* usable as the key: a
    // loser that was already suspended for a real reason keeps that reason and
    // never receives 'duplicate_email', so keying on it would strand that row
    // permanently renamed.
    //
    // Original case is not recoverable: it was recorded nowhere, and an address
    // is canonical by design now. Only the duplicate suffix is undone.
    //
    // Every SET expression reads the row as it was before this statement, so all
    // four below test pre-update values.
    await queryRunner.query(`
      UPDATE users
         SET email = regexp_replace(email, '\\+dupx?-[0-9a-f]{8,}(@|$)', '\\1'),
             -- Reactivate only what this migration deactivated. '+dupx-' marks a
             -- row that was already inactive; turning that one back on would be
             -- inventing a state the database never held.
             "isActive" =
               CASE WHEN email ~ '\\+dup-[0-9a-f]{8,}(@|$)' THEN true ELSE "isActive" END,
             "suspensionReason" =
               CASE WHEN "suspensionReason" = 'duplicate_email' THEN NULL
                    ELSE "suspensionReason" END,
             -- Strip only the appended line, leaving any operator notes that
             -- were there before exactly as they were.
             "suspensionComment" =
               NULLIF(
                 regexp_replace(
                   "suspensionComment",
                   -- Not an E'' string: inside one, Postgres consumes the
                   -- backslashes before the regex engine ever sees them, so
                   -- \\[ … \\] arrives as a character *class* and strips a single
                   -- character instead of the appended line.
                   '\\n?\\[CanonicalizeUserEmail1781500000000\\].*$',
                   ''
                 ),
                 ''
               )
       WHERE "suspensionComment" LIKE '%${MARKER}%'
         AND email ~ '\\+dupx?-[0-9a-f]{8,}(@|$)'
    `);
  }
}
