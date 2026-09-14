import { AppDataSource } from '@/config/database';
import { BasicUser } from '@/models/BasicUser';
import { User, UserType } from '@/models/User';
import { canonicalizeEmail } from '@/utils/email';
import userService from '@/services/UserService';

/**
 * An email address is one identity however it was typed.
 *
 * Two defects made that untrue. Every lookup compared the address verbatim
 * against a case-sensitive `varchar`, so capitalisation decided whether login
 * and recovery found your account. And the uniqueness `InitialSchema` declares
 * was never actually created in the shared database, leaving registration's
 * read-then-insert guard with nothing behind it — four pairs of byte-identical
 * addresses had already been written by concurrent requests 0.2ms apart.
 */
describe('email identity', () => {
  const repo = () => AppDataSource.getRepository(User);

  const register = (email: string) =>
    userService.createUser({
      email,
      password: 'Str0ng!Passw0rd',
      firstName: 'Case',
      lastName: 'Test',
      userType: UserType.CUSTOMER,
    });

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) await AppDataSource.initialize();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  describe('canonicalizeEmail', () => {
    it('folds case and surrounding whitespace', () => {
      expect(canonicalizeEmail('  User@Example.COM  ')).toBe('user@example.com');
    });

    it('leaves dots and plus-tags alone', () => {
      // Stripping these would merge addresses that some providers deliver to
      // different people, which is a worse error than the one being fixed.
      expect(canonicalizeEmail('first.last+tag@example.com')).toBe('first.last+tag@example.com');
    });
  });

  describe('registration', () => {
    it('stores the address canonically however it was typed', async () => {
      const user = await register('  MixedCase.User@Example.COM ');
      expect(user.email).toBe('mixedcase.user@example.com');

      const stored = await repo().findOneByOrFail({ id: user.id });
      expect(stored.email).toBe('mixedcase.user@example.com');
    });

    it('refuses a second account differing only in case', async () => {
      await register('Duplicate@Example.com');
      await expect(register('duplicate@example.com')).rejects.toThrow(/already exists/i);
      await expect(register('DUPLICATE@EXAMPLE.COM')).rejects.toThrow(/already exists/i);
    });
  });

  describe('lookups', () => {
    it('finds the account whatever case is supplied', async () => {
      await register('lookup@example.com');

      for (const typed of ['lookup@example.com', 'Lookup@Example.com', '  LOOKUP@EXAMPLE.COM  ']) {
        await expect(userService.getUserByEmail(typed)).resolves.toMatchObject({
          email: 'lookup@example.com',
        });
      }
    });

    it('authenticates whatever case is supplied', async () => {
      const email = 'login@example.com';
      const created = await register(email);
      await repo().update(created.id, { isVerified: true });

      const result = await userService.authenticateUser('LogIn@Example.COM', 'Str0ng!Passw0rd');
      expect(result.user.email).toBe(email);
    });

    it('reaches the account from recovery whatever case is supplied', async () => {
      // These paths answer silently whether or not the address exists, so a
      // case mismatch here is invisible: the user is told a mail was sent and
      // none ever was. The observable effect is the token on the row.
      const created = await register('recovery@example.com');

      await userService.requestPasswordReset('Recovery@Example.COM');
      const afterReset = await repo().findOne({
        where: { id: created.id },
        select: ['id', 'passwordResetToken'],
      });
      expect(afterReset?.passwordResetToken).toEqual(expect.any(String));

      await repo().update(created.id, { emailVerificationToken: null as unknown as string });
      await userService.resendVerification('RECOVERY@example.com');
      const afterResend = await repo().findOne({
        where: { id: created.id },
        select: ['id', 'emailVerificationToken'],
      });
      expect(afterResend?.emailVerificationToken).toEqual(expect.any(String));
    });
  });

  describe('the database enforces it, not just the service', () => {
    it('has the unique index the migration creates', async () => {
      // Asserted directly, because every other test in this block would pass
      // vacuously without it — an insert that should be rejected simply succeeds,
      // and "no error" reads the same as "correctly allowed".
      const [index] = await AppDataSource.query(
        `SELECT indexdef FROM pg_indexes
          WHERE tablename = 'users' AND indexname = 'UQ_users_email_lower'`
      );
      // Must cover both halves of the canonical form — the case fold *and* the
      // trim — or the backstop is narrower than the rule it backs.
      expect(index?.indexdef).toMatch(/UNIQUE.*lower\(btrim\(/i);
    });

    it('rejects a whitespace-variant insert too, not just a case one', async () => {
      // `canonicalizeEmail` trims as well as lowercases, so an index on
      // `lower(email)` alone would enforce only half of what the application
      // considers one identity.
      await register('trimmed@example.com');

      await expect(
        repo().insert({
          email: '  trimmed@example.com ',
          password: 'hashed',
          firstName: 'Bypass',
          lastName: 'Test',
          userType: UserType.CUSTOMER,
        })
      ).rejects.toThrow(/duplicate key|unique/i);
    });

    it('rejects a case-variant insert that bypasses the service entirely', async () => {
      // The service's own check is a read-then-insert. It is not the guarantee —
      // it is the friendly version of the guarantee. This is the guarantee, and
      // it is what makes the concurrent-registration race impossible rather than
      // merely unlikely.
      await register('enforced@example.com');

      await expect(
        repo().insert({
          email: 'ENFORCED@example.com',
          password: 'hashed',
          firstName: 'Bypass',
          lastName: 'Test',
          userType: UserType.CUSTOMER,
        })
      ).rejects.toThrow(/duplicate key|unique/i);
    });

    it('rejects two genuinely interleaved registrations of the same address', async () => {
      // The shape that produced the four existing duplicate pairs: both
      // transactions read "no such user" *before* either writes.
      //
      // `Promise.all` over two service calls does not reproduce this — the first
      // insert commits before the second query begins, so the service's own
      // read-then-insert check catches it and the database is never asked. The
      // two connections and the explicit transactions are the point: without
      // them this passes with the unique index dropped.
      const first = AppDataSource.createQueryRunner();
      const second = AppDataSource.createQueryRunner();

      try {
        await first.connect();
        await second.connect();
        await first.startTransaction();
        await second.startTransaction();

        const insert = (runner: typeof first, email: string) =>
          runner.query(
            `INSERT INTO users (email, password, "firstName", "lastName", "userType")
             VALUES ($1, 'hashed', 'Race', 'Test', 'customer')`,
            [email]
          );

        // Both look, both find nothing — the check-then-act window, held open.
        expect(
          await first.query(`SELECT id FROM users WHERE lower(email) = 'interleaved@example.com'`)
        ).toHaveLength(0);
        expect(
          await second.query(`SELECT id FROM users WHERE lower(email) = 'interleaved@example.com'`)
        ).toHaveLength(0);

        await insert(first, 'interleaved@example.com');
        // Blocks on the index until the first transaction resolves, then fails.
        const blocked = insert(second, 'INTERLEAVED@example.com');
        await first.commitTransaction();

        await expect(blocked).rejects.toMatchObject({ code: '23505' });
        await second.rollbackTransaction();
      } finally {
        await first.release();
        await second.release();
      }

      expect(await repo().countBy({ email: 'interleaved@example.com' })).toBe(1);
    });

    it('tells the loser of that race what a duplicate registration is told', async () => {
      // Losing the race must not surface `duplicate key value violates unique
      // constraint "UQ_users_email_lower"` to the user — it is untranslated and
      // it names the index. The window is forced open here by making the
      // service's own check miss a row that exists.
      await register('mapped@example.com');

      // Spied on the repository the service actually holds. `UserService` uses
      // the `BasicUser` entity, which is a different TypeORM repository object
      // from the `User` one this file reads with — mocking the wrong one leaves
      // the real check in place, and the test then passes by taking the ordinary
      // duplicate path instead of the race it claims to cover.
      const serviceRepo = AppDataSource.getRepository(BasicUser);
      const spy = jest.spyOn(serviceRepo, 'findOne').mockResolvedValueOnce(null);

      await expect(register('Mapped@Example.com')).rejects.toThrow(
        'User with this email already exists'
      );
      expect(spy).toHaveBeenCalled();

      jest.restoreAllMocks();
    });
  });
});
