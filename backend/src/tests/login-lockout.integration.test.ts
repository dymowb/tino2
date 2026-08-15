import request from 'supertest';
import App from '@/app';
import { AppDataSource } from '@/config/database';
import { BasicUser } from '@/models/BasicUser';

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

  it('does not reveal whether an unknown address is locked', async () => {
    for (let i = 0; i < 6; i++) {
      const response = await attempt('lock-nobody@example.com', 'WrongPassword1!');
      // No account, so nothing to lock — the answer stays a plain 401 rather than
      // becoming a 423 that would confirm the address exists.
      expect(response.status).toBe(401);
    }
  });
});
