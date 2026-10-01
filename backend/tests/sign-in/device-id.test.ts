import { signInWithTotp } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultHeaders, signUpUser } from '../fixtures';
import { authCookie, createMfaToken, createTotpUser, sessionsOf, setCookieOf, setCookiePair } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, setTestConfig } from '../test-utils';

// The device id is under test, not the authenticator code: every TOTP check passes.
vi.mock('#/modules/auth/totps/helpers/totps', () => ({ verifyTotp: vi.fn().mockResolvedValue(0) }));

setTestConfig({ enabledAuthStrategies: ['passkey', 'totp'] });

afterEach(async () => await clearDatabase());

describe('device id on sign-in', async () => {
  const call = await createAppClient();

  const signIn = async (user: { id: string; email: string }, deviceCookie?: string) => {
    const mfaToken = await createMfaToken(user);
    const cookies = [authCookie('confirm-mfa', mfaToken), deviceCookie].filter(Boolean).join('; ');
    const { response } = await call(signInWithTotp, { body: { code: '123456' }, headers: { ...defaultHeaders, Cookie: cookies } });
    expect(response.status).toBe(204);
    return response;
  };

  it('sets the device id SameSite=Lax so cross-site sign-in callbacks can read it, and locks the session cookie to the host, https and the server', async () => {
    const user = await createTotpUser(signUpUser.email);

    const res = await signIn(user);

    expect(setCookieOf(res, 'device-id').line).toContain('SameSite=Lax');
    // `__Host-`: Secure, Path=/ and no Domain, so no other host or subdomain can set or read it; HttpOnly keeps it from
    // scripts; Strict keeps it off requests another site starts.
    const session = setCookieOf(res, 'session').line;
    expect(session).toMatch(/^__Host-/);
    expect(session).toContain('Secure');
    expect(session).toContain('Path=/');
    expect(session).not.toContain('Domain=');
    expect(session).toContain('HttpOnly');
    expect(session).toContain('SameSite=Strict');
  });

  it('gives an mfa session a device id hash and replaces the same browser’s earlier session', async () => {
    const user = await createTotpUser(signUpUser.email);

    const first = await signIn(user);
    const [firstSession] = await sessionsOf(user.id);
    expect(firstSession.type).toBe('mfa');
    expect(firstSession.deviceIdHash).toBeTruthy();

    const deviceCookie = setCookiePair(first, 'device-id');
    await signIn(user, deviceCookie);

    // The earlier session stays as a revoked row; only the newer one authenticates.
    const sessions = await sessionsOf(user.id);
    expect(sessions).toHaveLength(2);
    const earlier = sessions.find((session) => session.id === firstSession.id);
    const newer = sessions.find((session) => session.id !== firstSession.id);
    expect(earlier).toMatchObject({ revocationReason: 'replaced', revokedBy: null });
    expect(earlier?.revokedAt).not.toBeNull();
    expect(newer?.revokedAt).toBeNull();
    expect(newer?.deviceIdHash).toBe(firstSession.deviceIdHash);
  });

  it('keeps sessions from different browsers side by side', async () => {
    const user = await createTotpUser(signUpUser.email);

    await signIn(user);
    await signIn(user);

    const sessions = await sessionsOf(user.id);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].deviceIdHash).not.toBe(sessions[1].deviceIdHash);
    // Neither browser's sign-in ended the other's session.
    expect(sessions.map((session) => session.revokedAt)).toEqual([null, null]);
  });
});
