import request from 'supertest';
import App from '@/app';
import { AppDataSource } from '@/config/database';
import { BasicUser } from '@/models/BasicUser';
import { passwordService } from '@/utils/password';
import emailService from '@/services/EmailService';

/**
 * The IP rate limiter in front of /auth/login throttles one noisy source but does
 * nothing about a distributed attempt against a single account. These pin the
 * per-account rule: five consecutive wrong passwords lock the account for a bounded
 * window, a success resets the count, and the lock lets go on its own.
 */
describe('login lockout', () => {
  const server = new App().app;
  const password = 'TestPassword123!';

  async function account(email: string) {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password, firstName: 'Lock', lastName: 'Test', userType: 'customer' })
      .expect(201);
    const user = await AppDataSource.getRepository(BasicUser).findOneByOrFail({ email });
    await request(server)
      .get('/api/v1/auth/verify-email')
      .query({ token: user.emailVerificationToken })
      .expect(200);
    return user;
  }

  function attempt(email: string, withPassword: string) {
    return request(server).post('/api/v1/auth/login').send({ email, password: withPassword });
  }

  async function readUser(email: string) {
    return AppDataSource.getRepository(BasicUser).findOneByOrFail({ email });
  }

  it('locks the account after five consecutive wrong passwords', async () => {
    const email = 'lock-basic@example.com';
    await account(email);

    for (let i = 0; i < 4; i++) {
      const response = await attempt(email, 'WrongPassword1!');
      // Identical response every time — the remaining-attempt count is not probeable.
      expect(response.status).toBe(401);
    }

    const fifth = await attempt(email, 'WrongPassword1!');
    expect(fifth.status).toBe(401);

    // Sixth request is refused as locked, and the correct password does not help.
    const locked = await attempt(email, password);
    expect(locked.status).toBe(423);
    expect(locked.body.error).toBe('ACCOUNT_LOCKED');
    expect(locked.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(locked.headers['retry-after']).toBeDefined();
  });

  it('does not lock a user who eventually gets it right', async () => {
    const email = 'lock-reset@example.com';
    await account(email);

    for (let i = 0; i < 4; i++) {
      await attempt(email, 'WrongPassword1!').expect(401);
    }

    await attempt(email, password).expect(200);

    // The counter measures consecutive failures, so a success clears it.
    expect((await readUser(email)).failedLoginAttempts).toBe(0);

    for (let i = 0; i < 4; i++) {
      await attempt(email, 'WrongPassword1!').expect(401);
    }
    // Still not locked: this is the fifth failure only if the earlier run counted.
    await attempt(email, password).expect(200);
  });

  it('lets the lock expire on its own', async () => {
    const email = 'lock-expiry@example.com';
    const user = await account(email);

    await AppDataSource.getRepository(BasicUser).update(user.id, {
      lockedUntil: new Date(Date.now() + 60_000),
    });
    await attempt(email, password).expect(423);

    // Bounded on purpose: an attacker who knows the address must not be able to
    // deny the owner access indefinitely by failing on purpose.
    await AppDataSource.getRepository(BasicUser).update(user.id, {
      lockedUntil: new Date(Date.now() - 1_000),
    });
    await attempt(email, password).expect(200);
  });

  it('starts a clean window after a lockout expires', async () => {
    const email = 'lock-window@example.com';
    const user = await account(email);

    await AppDataSource.getRepository(BasicUser).update(user.id, {
      failedLoginAttempts: 0,
      lockedUntil: new Date(Date.now() - 1_000),
    });

    // One wrong password after expiry must not immediately re-lock.
    await attempt(email, 'WrongPassword1!').expect(401);
    await attempt(email, password).expect(200);
  });

  it('counts failures per account, not globally', async () => {
    const victim = 'lock-victim@example.com';
    const bystander = 'lock-bystander@example.com';
    await account(victim);
    await account(bystander);

    for (let i = 0; i < 5; i++) {
      await attempt(victim, 'WrongPassword1!').expect(401);
    }

    await attempt(victim, password).expect(423);
    // Another account is untouched by the victim's failures.
    await attempt(bystander, password).expect(200);
  });

  it('locks under concurrent attempts, without losing counts', async () => {
    const email = 'lock-concurrent@example.com';
    await account(email);

    // The threat this feature exists for is distributed, so the attempts that must
    // be counted are the parallel ones. Deriving the next count in JavaScript from a
    // row read earlier loses updates here: every request reads the same value and
    // writes the same increment, so the threshold is never reached.
    const attempts = await Promise.all(
      Array.from({ length: 10 }, () => attempt(email, 'WrongPassword1!'))
    );

    // Every one is refused, and none leaks how close it came.
    for (const response of attempts) {
      expect([401, 423]).toContain(response.status);
    }

    // Ten parallel wrong passwords against a threshold of five must end locked.
    const locked = await attempt(email, password);
    expect(locked.status).toBe(423);

    const user = await readUser(email);
    expect(user.lockedUntil).not.toBeNull();
  });

  it('does not extend the lock window with further concurrent attempts', async () => {
    const email = 'lock-window-extend@example.com';
    const user = await account(email);

    for (let i = 0; i < 5; i++) {
      await attempt(email, 'WrongPassword1!');
    }
    const firstLock = (await readUser(email)).lockedUntil;
    expect(firstLock).not.toBeNull();

    await Promise.all(Array.from({ length: 5 }, () => attempt(email, 'WrongPassword1!')));

    // A locked account stops counting, so continued guessing cannot push the
    // release further out and turn a bounded lockout into a permanent one.
    const secondLock = (await readUser(email)).lockedUntil;
    expect(new Date(secondLock as Date).getTime()).toBe(new Date(firstLock as Date).getTime());
    expect(user.id).toBeDefined();
  });

  it('does not let a correct password in flight undo a lock applied while it was checked', async () => {
    const email = 'lock-toctou@example.com';
    await account(email);

    // The row is read before the password comparison, and bcrypt is slow by design —
    // long enough for concurrent guesses to lock the account while a correct password
    // is still being checked. Hold the comparison open to make that window
    // deterministic rather than hoping to hit it by timing.
    let releaseSuccess: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      releaseSuccess = resolve;
    });
    let reachedComparison: () => void = () => {};
    const inFlight = new Promise<void>((resolve) => {
      reachedComparison = resolve;
    });

    const realCompare = passwordService.compare.bind(passwordService);
    const compare = jest
      .spyOn(passwordService, 'compare')
      .mockImplementation(async (plain: string, hash: string) => {
        const result = await realCompare(plain, hash);
        if (plain === password) {
          reachedComparison();
          await held;
        }
        return result;
      });

    try {
      const success = attempt(email, password).then((response) => response);
      await inFlight;

      for (let i = 0; i < 5; i++) {
        await attempt(email, 'WrongPassword1!').expect(401);
      }
      expect((await readUser(email)).lockedUntil).not.toBeNull();

      releaseSuccess();
      const response = await success;

      // Knowing the password does not entitle this request to tokens: by the time it
      // finished, the account was locked. Otherwise an attacker who also knows the
      // password can race a login against their own failures to clear the lock.
      expect(response.status).toBe(423);
      expect(response.body?.data?.accessToken).toBeUndefined();

      // And the lock itself must survive — the stale snapshot must not wipe it.
      const after = await readUser(email);
      expect(after.lockedUntil).not.toBeNull();
      expect(new Date(after.lockedUntil as Date).getTime()).toBeGreaterThan(Date.now());
    } finally {
      compare.mockRestore();
      releaseSuccess();
    }
  });

  it('warns the owner when the lock is applied, and only then', async () => {
    const email = 'lock-stale-warning@example.com';
    const user = await account(email);

    const sendEmail = jest
      .spyOn(emailService, 'sendEmail')
      .mockResolvedValue({ success: true } as never);

    try {
      for (let i = 0; i < 4; i++) {
        await attempt(email, 'WrongPassword1!').expect(401);
      }
      // A wrong password on its own is not news. Mailing the owner every time trains
      // them to ignore the one that matters, and turns the login form into a way to
      // send mail to any address on demand.
      expect(sendEmail).not.toHaveBeenCalled();

      await attempt(email, 'WrongPassword1!').expect(401);
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: email });

      // Let the window pass. The counter is already zero — locking resets it.
      await AppDataSource.getRepository(BasicUser).update(user.id, {
        lockedUntil: new Date(Date.now() - 1_000),
      });
      sendEmail.mockClear();

      await attempt(email, 'WrongPassword1!').expect(401);

      // First failure of a fresh window, so still no warning.
      expect(sendEmail).not.toHaveBeenCalled();

      // The expired lock is cleared rather than left lying around as a value that
      // reads as "locked" to anything testing it for presence.
      const after = await readUser(email);
      expect(after.failedLoginAttempts).toBe(1);
      expect(after.lockedUntil).toBeNull();
    } finally {
      sendEmail.mockRestore();
    }
  });

  it('stores the lock as an instant, so the window is the configured one', async () => {
    const email = 'lock-window-length@example.com';
    await account(email);

    // The lock is written by the database and read back by node. As `timestamp
    // without time zone` the stored value carried no zone, so the two sides read it
    // in their own: with the database on UTC and the process on UTC-7 — the ordinary
    // arrangement, and the one this machine is in — a fifteen-minute lockout was
    // enforced as seven hours and fifteen, and the Retry-After said so.
    //
    // The column type is asserted directly because the behavioural check below only
    // catches this where the two zones actually differ; on a runner with both on UTC
    // the old column happens to behave. This assertion holds everywhere.
    const [column] = await AppDataSource.query(
      `SELECT data_type FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'lockedUntil'`
    );
    expect(column.data_type).toBe('timestamp with time zone');

    for (let i = 0; i < 5; i++) {
      await attempt(email, 'WrongPassword1!').expect(401);
    }

    const locked = await attempt(email, password);
    expect(locked.status).toBe(423);
    expect(locked.body.retryAfterSeconds).toBeGreaterThan(13 * 60);
    expect(locked.body.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);

    // Both readers agree on when the lock ends, whatever zone either is in.
    const stored = await readUser(email);
    const nodeMinutesAhead = (new Date(stored.lockedUntil as Date).getTime() - Date.now()) / 60_000;
    expect(nodeMinutesAhead).toBeGreaterThan(13);
    expect(nodeMinutesAhead).toBeLessThanOrEqual(15);

    const [{ sqlMinutesAhead }] = await AppDataSource.query(
      `SELECT EXTRACT(EPOCH FROM ("lockedUntil" - now())) / 60 AS "sqlMinutesAhead"
         FROM "users" WHERE "email" = $1`,
      [email]
    );
    expect(Math.abs(Number(sqlMinutesAhead) - nodeMinutesAhead)).toBeLessThan(1);
  });

  it('lets the owner back in through a password reset while the lock is live', async () => {
    const email = 'lock-recovery@example.com';
    const user = await account(email);

    for (let i = 0; i < 5; i++) {
      await attempt(email, 'WrongPassword1!').expect(401);
    }
    await attempt(email, password).expect(423);

    // Expiry alone is not a way out: whoever locked the account can spend five more
    // wrong passwords after every window and keep it shut for as long as they care
    // to. The route back has to be one that failed sign-ins cannot reach, so it runs
    // through the mailbox.
    await request(server).post('/api/v1/auth/forgot-password').send({ email }).expect(200);

    const { passwordResetToken } = await AppDataSource.getRepository(BasicUser)
      .createQueryBuilder('user')
      .select('user.passwordResetToken', 'passwordResetToken')
      .where('user.id = :id', { id: user.id })
      .getRawOne();
    expect(passwordResetToken).toBeTruthy();

    const newPassword = 'RecoveredPassword123!';
    await request(server)
      .post('/api/v1/auth/reset-password')
      .send({ token: passwordResetToken, password: newPassword, newPassword })
      .expect(200);

    // In immediately, without waiting out someone else's lockout.
    await attempt(email, newPassword).expect(200);

    const after = await readUser(email);
    expect(after.lockedUntil).toBeNull();
    expect(after.failedLoginAttempts).toBe(0);
  });

  it('does not reveal whether an unknown address is locked', async () => {
    for (let i = 0; i < 6; i++) {
      const response = await attempt('lock-nobody@example.com', 'WrongPassword1!');
      // No account, so nothing to lock — the answer stays a plain 401 rather than
      // becoming a 423 that would confirm the address exists.
      expect(response.status).toBe(401);
    }
  });
});
