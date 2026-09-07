import { MigrationInterface, QueryRunner } from 'typeorm';

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
/** Written into `suspensionComment` on every renamed row, and the key `down()`
 * matches on. Deliberately unmistakable: it must not appear in operator notes. */
const MARKER = '[CanonicalizeUserEmail1781500000000]';

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
    const renamed: Array<{ id: string; original: string; renamed: string }> =
      await queryRunner.query(`
        WITH ranked AS (
          SELECT id, email, "isActive",
                 row_number() OVER (
                   PARTITION BY lower(btrim(email))
                   ORDER BY "lastLogin" DESC NULLS LAST, "createdAt" ASC, id ASC
                 ) AS rn
            FROM users
        ),
        losers AS (
          SELECT id, email, "isActive" FROM ranked WHERE rn > 1
        ),
        updated AS (
          UPDATE users u
             SET email =
                   CASE
                     -- Ordinary address: tag the local part, which keeps the
                     -- result a valid address and the original recoverable.
                     WHEN l.email ~ '^[^@]+@[^@]+$'
                       THEN split_part(l.email, '@', 1)
                            || CASE WHEN l."isActive" THEN '+dup-' ELSE '+dupx-' END
                            || left(u.id::text, 8)
                            || '@' || split_part(l.email, '@', 2)
                     -- Anything else is not an address this can safely take
                     -- apart, so the suffix goes on the end verbatim.
                     ELSE l.email
                          || CASE WHEN l."isActive" THEN '+dup-' ELSE '+dupx-' END
                          || left(u.id::text, 8)
                   END,
                 "isActive" = false,
                 -- Never overwrite an existing suspension: a row may already be
                 -- suspended for a real reason, and that reason outranks this.
                 -- Only claimed for a row this migration actually deactivated.
                 "suspensionReason" =
                   CASE WHEN l."isActive"
                        THEN COALESCE(u."suspensionReason", 'duplicate_email')
                        ELSE u."suspensionReason" END,
                 -- Appended, never substituted: an existing comment is real
                 -- operator notes and must survive. The bracketed tag is what
                 -- down() matches on, so a rollback touches only rows this
                 -- migration actually wrote -- an address a user legitimately
                 -- owns that merely looks suffixed is left alone. The sentence
                 -- states which action was actually taken, and only that one.
                 "suspensionComment" =
                   COALESCE(u."suspensionComment" || E'\n', '')
                   || '${MARKER} Original address: ' || l.email || '. '
                   || CASE WHEN l."isActive"
                           THEN 'Deactivated by this migration because it collided, ignoring case, '
                                || 'with another account. Reversible: see the migration''s down().'
                           ELSE 'This account was already inactive; the migration only renamed it.'
                      END
            FROM losers l
           WHERE u.id = l.id
          RETURNING u.id, l.email AS original, u.email AS renamed
        )
        SELECT * FROM updated
      `);

    for (const row of renamed) {
      // Rewriting somebody's address is not something to do silently.
      // eslint-disable-next-line no-console
      console.warn(
        `[CanonicalizeUserEmail] duplicate address "${row.original}" -> "${row.renamed}" (user ${row.id}, deactivated)`
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
         SET email = regexp_replace(email, '\\+dupx?-[0-9a-f]{8}(@|$)', '\\1'),
             -- Reactivate only what this migration deactivated. '+dupx-' marks a
             -- row that was already inactive; turning that one back on would be
             -- inventing a state the database never held.
             "isActive" =
               CASE WHEN email ~ '\\+dup-[0-9a-f]{8}(@|$)' THEN true ELSE "isActive" END,
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
         AND email ~ '\\+dupx?-[0-9a-f]{8}(@|$)'
    `);
  }
}
