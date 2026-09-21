import { eq } from 'drizzle-orm';
import { getMyAuth, type MeAuthData, signInWithTotp } from 'sdk';
import { nanoid } from 'shared/utils/nanoid';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { devicesTable } from '#/modules/auth/devices-db';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { enrollDevice } from '#/modules/auth/general/helpers/enroll-device';
import { notifyNewSignIn } from '#/modules/auth/general/helpers/notify-sign-in';
import { createSession, type SignInContext } from '#/modules/auth/general/helpers/session';
import { pruneDevices } from '#/modules/auth/jobs/prune-devices';
import type { AuthStrategy } from '#/modules/auth/sessions-db';
import { userCountersTable } from '#/modules/user/user-counters-db';
import { hashDeviceIdForUser } from '#/utils/hash-pii';
import { defaultHeaders, signUpUser } from '../fixtures';
import { createMfaToken, createTestSession, createTestUser, createTotpUser } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

vi.mock('#/lib/mailer', () => ({
  mailer: { prepareEmails: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('#/modules/auth/totps/helpers/totps', () => ({
  validateTOTP: vi.fn().mockResolvedValue(true),
  signInWithTotp: vi.fn().mockReturnValue(true),
}));

setTestConfig({ enabledAuthStrategies: ['passkey', 'totp'] });

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => {
  await clearDatabase();
  vi.clearAllMocks();
});

const browser = (deviceId: string | null = nanoid(24)): SignInContext => ({
  rawIp: null,
  country: 'NL',
  asn: null,
  device: { name: null, type: 'desktop', os: 'macOS', browser: 'Firefox' },
  deviceId,
});

/** Marks the account as one that has signed in before; createTestUser leaves user_counters empty. */
const seedEarlierSignIn = (userId: string) =>
  db.insert(userCountersTable).values({ userId, lastSignInAt: new Date(Date.now() - 86_400_000).toISOString() });

const devicesOf = (userId: string) => db.select().from(devicesTable).where(eq(devicesTable.userId, userId));

/** Statics of every new sign-in notice handed to the mailer. */
const notices = () =>
  vi
    .mocked(mailer.prepareEmails)
    .mock.calls.map(([, statics]) => statics as { type: string; details: Record<string, string> })
    .filter((statics) => statics.type === 'new-sign-in');

/** A full sign-in without a request: the session, then the notice its new device calls for. */
const signIn = async (
  user: Awaited<ReturnType<typeof createTestUser>>,
  context: SignInContext,
  strategy: AuthStrategy = 'passkey',
) => {
  const { newDevice } = await createSession(user, context, strategy);
  if (newDevice) await notifyNewSignIn({ user, context, strategy, newDevice });
  return newDevice;
};

describe('enrollDevice', () => {
  it('reports a browser as new once, then only moves when it was last seen', async () => {
    const user = await createTestUser(signUpUser.email);
    const deviceId = nanoid(24);

    const first = await enrollDevice(user.id, deviceId);
    const lastWeek = new Date(Date.now() - 7 * 86_400_000).toISOString();
    await db.update(devicesTable).set({ firstSeenAt: lastWeek, lastSeenAt: lastWeek });
    const again = await enrollDevice(user.id, deviceId);

    expect(first.isNew).toBe(true);
    expect(again.isNew).toBe(false);
    expect(first.deviceIdHash).toBe(hashDeviceIdForUser(deviceId, user.id));

    const [row] = await devicesOf(user.id);
    expect(new Date(row.lastSeenAt).getTime()).toBeGreaterThan(new Date(row.firstSeenAt).getTime());
  });

  it('treats one shared browser as new for each user', async () => {
    const alice = await createTestUser('alice@example.com');
    const bob = await createTestUser('bob@example.com');
    const deviceId = nanoid(24);

    const forAlice = await enrollDevice(alice.id, deviceId);
    const forBob = await enrollDevice(bob.id, deviceId);

    expect(forAlice.isNew).toBe(true);
    expect(forBob.isNew).toBe(true);
    expect(forAlice.deviceIdHash).not.toBe(forBob.deviceIdHash);
  });

  it('lets exactly one of several parallel sign-ins see the browser as new', async () => {
    const user = await createTestUser(signUpUser.email);
    const deviceId = nanoid(24);

    const results = await Promise.all(Array.from({ length: 5 }, () => enrollDevice(user.id, deviceId)));

    expect(results.filter((result) => result.isNew)).toHaveLength(1);
  });
});

describe('new sign-in notice', () => {
  it('goes out for an unseen browser on an account that signed in before', async () => {
    const user = await createTestUser(signUpUser.email);
    await seedEarlierSignIn(user.id);

    await signIn(user, browser());

    expect(notices()).toHaveLength(1);
    expect(notices()[0].details).toMatchObject({
      browser: 'Firefox',
      os: 'macOS',
      country: 'Netherlands',
      strategy: 'Passkey',
    });
    expect(notices()[0].details.accountUrl).toMatch(/\/account$/);
    expect(notices()[0].details.timestamp).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/);

    const [row] = await devicesOf(user.id);
    expect(row.notifiedAt).toBeTruthy();
  });

  it('stays silent for the first sign-in of a new account, and for the same browser afterwards', async () => {
    const user = await createTestUser(signUpUser.email);
    const context = browser();

    const first = await signIn(user, context);
    const second = await signIn(user, context);

    expect(first).toMatchObject({ previousSignInAt: null });
    expect(second).toBeNull();
    expect(notices()).toHaveLength(0);
    expect(await devicesOf(user.id)).toHaveLength(1);
  });

  it.each(['magic', 'email'] as const)(
    'enrolls but does not mail a %s sign-in, which went through the inbox',
    async (strategy) => {
      const user = await createTestUser(signUpUser.email);
      await seedEarlierSignIn(user.id);
      const context = browser();

      await signIn(user, context, strategy);
      // The browser proved itself through the inbox, so a later passkey sign-in from it is familiar.
      const later = await signIn(user, context, 'passkey');

      expect(later).toBeNull();
      expect(notices()).toHaveLength(0);
      expect(await devicesOf(user.id)).toHaveLength(1);
    },
  );

  it('never enrolls or mails an impersonation session', async () => {
    const user = await createTestUser(signUpUser.email);
    await seedEarlierSignIn(user.id);

    const { newDevice } = await createSession(user, browser(null), 'passkey', 'impersonation');

    expect(newDevice).toBeNull();
    expect(await devicesOf(user.id)).toHaveLength(0);
  });

  it('stops after three notices in a day while still enrolling the browser', async () => {
    const user = await createTestUser(signUpUser.email);
    await seedEarlierSignIn(user.id);

    for (let i = 0; i < 4; i++) await signIn(user, browser());

    expect(notices()).toHaveLength(3);
    const rows = await devicesOf(user.id);
    expect(rows).toHaveLength(4);
    expect(rows.filter((row) => row.notifiedAt)).toHaveLength(3);
  });

  it('does not let a mailer failure surface', async () => {
    const user = await createTestUser(signUpUser.email);
    await seedEarlierSignIn(user.id);
    vi.mocked(mailer.prepareEmails).mockRejectedValueOnce(new Error('mail provider down'));

    await expect(signIn(user, browser())).resolves.toBeTruthy();
  });
});

describe('new sign-in notice through the sign-in endpoint', async () => {
  const call = await createAppClient();

  const signInWithMfa = async (user: { id: string; email: string }, deviceCookie?: string) => {
    const mfaToken = await createMfaToken(user);
    const cookies = [`${authCookieName('confirm-mfa')}=${mfaToken}`, deviceCookie].filter(Boolean).join('; ');
    const { response } = await call(signInWithTotp, {
      body: { code: '123456' },
      headers: { ...defaultHeaders, Cookie: cookies },
    });
    expect(response.status).toBe(204);
    return response.headers
      .getSetCookie()
      .find((line) => line.startsWith(`${authCookieName('device-id')}=`))
      ?.split(';')[0];
  };

  it('mails an mfa sign-in from an unseen browser, and not the next one carrying its device id', async () => {
    const user = await createTotpUser(signUpUser.email);
    await seedEarlierSignIn(user.id);

    const deviceCookie = await signInWithMfa(user);
    await vi.waitFor(() => expect(notices()).toHaveLength(1));
    expect(notices()[0].details.strategy).toBe('Authenticator app');

    await signInWithMfa(user, deviceCookie);
    // Let a wrongly sent second notice surface before asserting there is none.
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(notices()).toHaveLength(1);
    expect(await devicesOf(user.id)).toHaveLength(1);
  });
});

describe('sessions list flags sessions from a new browser', async () => {
  const call = await createAppClient();

  const sessionsOf = async (user: { id: string }) => {
    const { data, response } = await call(getMyAuth, {
      headers: { ...defaultHeaders, Cookie: await createTestSession(user) },
    });
    expect(response.status).toBe(200);
    // The test client types data as unknown; the SDK already consumed the body.
    return (data as MeAuthData).sessions;
  };

  it('flags a browser first seen this week, never the first one known', async () => {
    const user = await createTestUser(signUpUser.email);
    const known = await createSession(user, browser(), 'passkey');
    const recent = await createSession(user, browser(), 'passkey');

    const sessions = await sessionsOf(user);

    expect(sessions.find(({ id }) => id === known.sessionId)?.isNewDevice).toBe(false);
    expect(sessions.find(({ id }) => id === recent.sessionId)?.isNewDevice).toBe(true);
    // The requesting session carries no device id at all.
    expect(sessions.find(({ isCurrent }) => isCurrent)?.isNewDevice).toBe(false);
  });

  it('stops flagging a browser once it has been known for longer than a session lives', async () => {
    const user = await createTestUser(signUpUser.email);
    await createSession(user, browser(), 'passkey');
    const aged = await createSession(user, browser(), 'passkey');

    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
    const nineDaysAgo = new Date(Date.now() - 9 * 86_400_000).toISOString();
    await db.update(devicesTable).set({ firstSeenAt: nineDaysAgo }).where(eq(devicesTable.userId, user.id));
    await db
      .update(devicesTable)
      .set({ firstSeenAt: eightDaysAgo })
      .where(eq(devicesTable.deviceIdHash, aged.newDevice?.deviceIdHash ?? ''));

    const sessions = await sessionsOf(user);
    expect(sessions.every(({ isNewDevice }) => !isNewDevice)).toBe(true);
  });
});

describe('pruneDevices', () => {
  const insertDevice = (userId: string, lastSeenAt: Date) =>
    db.insert(devicesTable).values({
      userId,
      deviceIdHash: hashDeviceIdForUser(nanoid(24), userId),
      firstSeenAt: lastSeenAt.toISOString(),
      lastSeenAt: lastSeenAt.toISOString(),
    });

  it('removes rows older than the device cookie can live and keeps the rest', async () => {
    const user = await createTestUser(signUpUser.email);
    const day = 86_400_000;
    await insertDevice(user.id, new Date(Date.now() - 401 * day));
    await insertDevice(user.id, new Date(Date.now() - 399 * day));

    expect(await pruneDevices()).toBe(1);
    expect(await devicesOf(user.id)).toHaveLength(1);
  });

  it('keeps each user’s fifty most recently seen browsers', async () => {
    const user = await createTestUser(signUpUser.email);
    const other = await createTestUser('other@example.com');
    for (let i = 0; i < 53; i++) await insertDevice(user.id, new Date(Date.now() - i * 60_000));
    await insertDevice(other.id, new Date(Date.now() - 1000 * 60_000));

    expect(await pruneDevices()).toBe(3);

    const rows = await devicesOf(user.id);
    expect(rows).toHaveLength(50);
    // The three oldest are the ones that went. The column has no time zone and holds UTC.
    const oldestKept = Math.min(...rows.map((row) => new Date(`${row.lastSeenAt.replace(' ', 'T')}Z`).getTime()));
    expect(Date.now() - oldestKept).toBeLessThan(51 * 60_000);
    expect(await devicesOf(other.id)).toHaveLength(1);
  });
});
