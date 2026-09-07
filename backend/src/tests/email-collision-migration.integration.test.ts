import { AppDataSource } from '@/config/database';
import { User, UserType } from '@/models/User';
import { CanonicalizeUserEmail1781500000000 } from '@/migrations/1781500000000-CanonicalizeUserEmail';

/**
 * The migration's collision branch, exercised against real rows.
 *
 * This is the part that runs once, unsupervised, against a shared database and
 * rewrites people's email addresses. The rest of the migration is a lowercase
 * and an index; this is the part worth proving.
 */
describe('CanonicalizeUserEmail collision handling', () => {
  const repo = () => AppDataSource.getRepository(User);
  const migration = new CanonicalizeUserEmail1781500000000();

  const makeUser = (overrides: Partial<User>): Promise<User> =>
    repo().save(
      repo().create({
        password: 'hashed',
        firstName: 'Collide',
        lastName: 'Test',
        userType: UserType.CUSTOMER,
        isActive: true,
        ...overrides,
      })
    );

  /** The index the migration creates is already in place from the normal
   * migration run, so it has to come off before colliding rows can be planted. */
  const runMigration = async () => {
    const runner = AppDataSource.createQueryRunner();
    try {
      await migration.up(runner);
    } finally {
      await runner.release();
    }
  };

  const revertMigration = async () => {
    const runner = AppDataSource.createQueryRunner();
    try {
      await migration.down(runner);
    } finally {
      await runner.release();
    }
  };

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  });

  beforeEach(async () => {
    await AppDataSource.query(`DROP INDEX IF EXISTS "UQ_users_email_lower"`);
  });

  afterAll(async () => {
    // This suite drops a schema-level invariant to plant the rows it needs, and
    // the index is global state: leaving it off silently disarms every other
    // test that relies on the database enforcing uniqueness. The rows have to go
    // first, because the last test deliberately ends with a collision restored.
    await AppDataSource.query(`DELETE FROM users`);
    await AppDataSource.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_email_lower" ON "users" (lower(btrim("email")))`
    );
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it('keeps the oldest account and renames the other', async () => {
    // `lastLogin` leads the migration's ORDER BY but is never written anywhere
    // in this codebase, so `createdAt ASC` is what actually decides. Set here in
    // SQL for the same reason the other fixtures are: a JS `Date` parameter and
    // the column's own `DEFAULT now()` are rendered in different zones.
    const used = await makeUser({ email: 'shared@example.com' });
    const stale = await makeUser({ email: 'Shared@Example.com' });
    await AppDataSource.query(
      `UPDATE users SET "createdAt" = now() - interval '1 day' WHERE id=$1`,
      [used.id]
    );

    await runMigration();

    const keeper = await repo().findOneByOrFail({ id: used.id });
    const loser = await repo().findOneByOrFail({ id: stale.id });

    expect(keeper.email).toBe('shared@example.com');
    expect(keeper.isActive).toBe(true);

    // Renamed rather than deleted, and the original address is still legible
    // inside the new one.
    expect(loser.email).toBe(`shared+dup-${stale.id.slice(0, 8)}@example.com`);
    expect(loser.isActive).toBe(false);
    expect(loser.suspensionReason).toBe('duplicate_email');
    expect(loser.suspensionComment).toContain('Shared@Example.com');
  });

  it('falls back to the oldest account when neither has been used', async () => {
    const older = await makeUser({ email: 'nologin@example.com' });
    await AppDataSource.query(
      `UPDATE users SET "createdAt" = "createdAt" - interval '1 day' WHERE id = $1`,
      [older.id]
    );
    const newer = await makeUser({ email: 'NoLogin@Example.com' });

    await runMigration();

    expect((await repo().findOneByOrFail({ id: older.id })).email).toBe('nologin@example.com');
    expect((await repo().findOneByOrFail({ id: newer.id })).email).toContain('+dup-');
  });

  it('never overwrites a suspension that was already there', async () => {
    // A row may already be suspended for a real reason, and that reason is more
    // important than this one.
    const keeper = await makeUser({ email: 'suspended@example.com' });
    const loser = await makeUser({
      email: 'Suspended@Example.com',
      isActive: false,
      suspensionReason: 'fraud',
      suspensionComment: 'Chargeback ring',
    });
    await AppDataSource.query(
      `UPDATE users SET "createdAt" = now() - interval '1 day' WHERE id=$1`,
      [keeper.id]
    );

    await runMigration();

    const after = await repo().findOneByOrFail({ id: loser.id });
    expect(after.suspensionReason).toBe('fraud');
    // The operator's note survives; the migration's line is appended after it.
    expect(after.suspensionComment).toContain('Chargeback ring');
    expect(after.suspensionComment).toContain('[CanonicalizeUserEmail1781500000000]');
    // Marked `+dupx-`, not `+dup-`: this row was already inactive, so the
    // rollback must not claim credit for deactivating it — and the note must
    // not say it was deactivated either.
    expect(after.email).toContain('+dupx-');
    expect(after.suspensionComment).toContain('already inactive');
    expect(after.suspensionComment).not.toContain('Deactivated by this migration');
  });

  it('restores a row whose suspension it could not mark, without reactivating it', async () => {
    // The row above never receives the `duplicate_email` marker, because it
    // already had a reason. A `down()` keyed on that marker would leave this
    // account permanently renamed — and one keyed only on the suffix would
    // switch a fraud-suspended account back on.
    const keeper = await makeUser({ email: 'fraudcase@example.com' });
    const loser = await makeUser({
      email: 'FraudCase@Example.com',
      isActive: false,
      suspensionReason: 'fraud',
      suspensionComment: 'Chargeback ring',
    });
    await AppDataSource.query(
      `UPDATE users SET "createdAt" = now() - interval '1 day' WHERE id=$1`,
      [keeper.id]
    );

    await runMigration();
    await revertMigration();

    const after = await repo().findOneByOrFail({ id: loser.id });
    expect(after.email).toBe('fraudcase@example.com');
    expect(after.isActive).toBe(false);
    expect(after.suspensionReason).toBe('fraud');
    // Byte-for-byte what the operator wrote, with the migration's line removed.
    expect(after.suspensionComment).toBe('Chargeback ring');
  });

  it('does not reactivate a loser that was already inactive', async () => {
    // Deactivated for no recorded reason — a rollback that flips `isActive` on
    // for everything it renamed would invent a state the database never held.
    const keeper = await makeUser({ email: 'dormant@example.com' });
    const loser = await makeUser({ email: 'Dormant@Example.com', isActive: false });
    await AppDataSource.query(
      `UPDATE users SET "createdAt" = now() - interval '1 day' WHERE id=$1`,
      [keeper.id]
    );

    await runMigration();
    await revertMigration();

    const after = await repo().findOneByOrFail({ id: loser.id });
    expect(after.email).toBe('dormant@example.com');
    expect(after.isActive).toBe(false);
    // It had no note before, so it has none after — not an empty string, and
    // certainly not a leftover claim that this migration deactivated it.
    expect(after.suspensionComment).toBeNull();
  });

  it('leaves an address that merely looks suffixed completely alone', async () => {
    // `bob+dup-deadbeef@example.com` is a perfectly ordinary plus-tagged
    // address. A `down()` keyed on the suffix pattern alone would rewrite it to
    // `bob@example.com` and switch the account on — and since `down()` drops the
    // unique index first, that could manufacture the very duplicate this
    // migration exists to prevent.
    const lookalike = await makeUser({
      email: 'bob+dup-deadbeef@example.com',
      isActive: false,
    });
    const other = await makeUser({ email: 'bob@example.com' });

    await runMigration();
    await revertMigration();

    const after = await repo().findOneByOrFail({ id: lookalike.id });
    expect(after.email).toBe('bob+dup-deadbeef@example.com');
    expect(after.isActive).toBe(false);
    expect(await repo().findOneByOrFail({ id: other.id })).toMatchObject({
      email: 'bob@example.com',
    });
  });

  it('canonicalises addresses that do not collide', async () => {
    const user = await makeUser({ email: '  Plain.User@Example.COM  ' });

    await runMigration();

    expect((await repo().findOneByOrFail({ id: user.id })).email).toBe('plain.user@example.com');
  });

  it('leaves three-way collisions with exactly one survivor', async () => {
    const a = await makeUser({ email: 'triple@example.com' });
    const b = await makeUser({ email: 'Triple@example.com' });
    const c = await makeUser({ email: 'TRIPLE@EXAMPLE.COM' });

    await runMigration();

    const emails = await Promise.all(
      [a, b, c].map(async (u) => (await repo().findOneByOrFail({ id: u.id })).email)
    );
    expect(emails.filter((e) => e === 'triple@example.com')).toHaveLength(1);
    expect(emails.filter((e) => e.includes('+dup-'))).toHaveLength(2);
    // And the index it then creates would have rejected anything less.
    expect(new Set(emails).size).toBe(3);
  });

  it('is reversible', async () => {
    const keeper = await makeUser({ email: 'revert@example.com' });
    await repo().update(keeper.id, { lastLogin: new Date() });
    const loser = await makeUser({ email: 'Revert@Example.com' });

    await runMigration();
    await revertMigration();

    const restored = await repo().findOneByOrFail({ id: loser.id });
    // Original case is deliberately not restored — addresses are canonical by
    // design now — but the identity and the account come back.
    expect(restored.email).toBe('revert@example.com');
    expect(restored.isActive).toBe(true);
    expect(restored.suspensionReason).toBeNull();
  });

  it('leaves a row alone on revert if someone has since edited it', async () => {
    const keeper = await makeUser({ email: 'edited@example.com' });
    await repo().update(keeper.id, { lastLogin: new Date() });
    const loser = await makeUser({ email: 'Edited@Example.com' });

    await runMigration();
    await repo().update(loser.id, { email: 'moved-on@example.com' });
    await revertMigration();

    // Restoring would have clobbered a deliberate change with a stale address.
    expect((await repo().findOneByOrFail({ id: loser.id })).email).toBe('moved-on@example.com');
  });
});
