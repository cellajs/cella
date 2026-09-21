import { eq } from 'drizzle-orm';
import { signInWithTotp } from 'sdk';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { defaultHeaders, signUpUser } from '../fixtures';
import { createMfaToken, createTotpUser } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

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

/** The Set-Cookie line of one auth cookie, or undefined. */
const setCookieLine = (res: Response, name: Parameters<typeof authCookieName>[0]) =>
  res.headers.getSetCookie().find((line) => line.startsWith(`${authCookieName(name)}=`));

describe('device id on sign-in', async () => {
  const call = await createAppClient();

  const signIn = async (user: { id: string; email: string }, deviceCookie?: string) => {
    const mfaToken = await createMfaToken(user);
    const cookies = [`${authCookieName('confirm-mfa')}=${mfaToken}`, deviceCookie].filter(Boolean).join('; ');
    const { response } = await call(signInWithTotp, {
      body: { code: '123456' },
      headers: { ...defaultHeaders, Cookie: cookies },
    });
    expect(response.status).toBe(204);
    return response;
  };

  const sessionsOf = (userId: string) => db.select().from(sessionsTable).where(eq(sessionsTable.userId, userId));

  it('sets the device id SameSite=Lax so cross-site sign-in callbacks can read it, and keeps the session Strict', async () => {
    const user = await createTotpUser(signUpUser.email);

    const res = await signIn(user);

    expect(setCookieLine(res, 'device-id')).toContain('SameSite=Lax');
    expect(setCookieLine(res, 'session')).toContain('SameSite=Strict');
  });

  it('gives an mfa session a device id hash and replaces the same browser’s earlier session', async () => {
    const user = await createTotpUser(signUpUser.email);

    const first = await signIn(user);
    const [firstSession] = await sessionsOf(user.id);
    expect(firstSession.type).toBe('mfa');
    expect(firstSession.deviceIdHash).toBeTruthy();

    const deviceCookie = setCookieLine(first, 'device-id')?.split(';')[0];
    await signIn(user, deviceCookie);

    const sessions = await sessionsOf(user.id);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).not.toBe(firstSession.id);
    expect(sessions[0].deviceIdHash).toBe(firstSession.deviceIdHash);
  });

  it('keeps sessions from different browsers side by side', async () => {
    const user = await createTotpUser(signUpUser.email);

    await signIn(user);
    await signIn(user);

    const sessions = await sessionsOf(user.id);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].deviceIdHash).not.toBe(sessions[1].deviceIdHash);
  });
});
