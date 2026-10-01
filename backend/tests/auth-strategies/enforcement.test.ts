import { createTotp, generatePasskeyChallenge, generateTotpKey, github, google, microsoft, signInWithTotp, toggleMfa } from 'sdk';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defaultHeaders } from '../fixtures';
import { authCookie, createMfaToken, createTestSession, createTestUser, createTotpUser, type ErrorResponse, expectRefusal } from '../helpers';
import { passkeySignIn } from '../security/helpers';
import { softwarePasskey } from '../software-passkey';
import { createAppClient } from '../test-client';
import { clearDatabase, setTestConfig } from '../test-utils';

afterEach(async () => {
  await clearDatabase();
});

describe('oauth strategy disabled', async () => {
  beforeAll(() => {
    setTestConfig({ enabledAuthStrategies: ['passkey', 'totp'], enabledOAuthProviders: [], selfRegistration: true });
  });
  const call = await createAppClient();

  it.each([
    { provider: 'github', fn: github },
    { provider: 'google', fn: google },
    { provider: 'microsoft', fn: microsoft },
  ])('should reject $provider OAuth initiation', async ({ provider, fn }) => {
    const { response: res, error } = await call(fn, { query: {}, headers: defaultHeaders });
    await expectRefusal({ response: res, error }, 400, 'unsupported_oauth');
    expect((error as ErrorResponse & { meta: Record<string, string> }).meta.strategy).toBe(provider);
  });
});

// OAuth provider configuration: only GitHub enabled.
describe('oauth provider configuration', async () => {
  beforeAll(() => {
    setTestConfig({ enabledAuthStrategies: ['oauth'], enabledOAuthProviders: ['github'], selfRegistration: true });
  });
  const call = await createAppClient();

  it('sends the browser to the enabled GitHub provider (positive control)', async () => {
    const { response: res } = await call(github, { query: {}, headers: defaultHeaders });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.origin).toBe('https://github.com');
    expect(location.searchParams.get('state')).toBeTruthy();
  });

  it.each([
    { provider: 'google', fn: google },
    { provider: 'microsoft', fn: microsoft },
  ])('should reject disabled $provider provider', async ({ provider, fn }) => {
    const { response: res, error } = await call(fn, { query: {}, headers: defaultHeaders });
    await expectRefusal({ response: res, error }, 400, 'unsupported_oauth');
    expect((error as ErrorResponse & { meta: Record<string, string> }).meta.strategy).toBe(provider);
  });
});

describe('passkey strategy disabled', async () => {
  beforeAll(() => {
    setTestConfig({ enabledAuthStrategies: ['oauth', 'totp'], selfRegistration: true });
  });
  const call = await createAppClient();

  it('should reject passkey generation', async () => {
    const { response: res, error } = await call(generatePasskeyChallenge, { body: { type: 'registration' }, headers: defaultHeaders });
    await expectRefusal({ response: res, error }, 400, 'forbidden_strategy');
  });

  it('should reject passkey authentication', async () => {
    const refused = await passkeySignIn(softwarePasskey().assert('a-challenge'), '');
    await expectRefusal(refused, 400, 'forbidden_strategy');
  });
});

describe('totp strategy disabled', async () => {
  beforeAll(() => {
    setTestConfig({ enabledAuthStrategies: ['oauth', 'passkey'], selfRegistration: true });
  });
  const call = await createAppClient();

  // Signed in: the refusal must come from the strategy, not from the missing session.
  it('must not start TOTP enrollment via generateTotpKey while TOTP is off', async () => {
    const user = await createTestUser('totp-off@example.com');
    const headers = { ...defaultHeaders, Cookie: await createTestSession(user) };

    const generated = await call(generateTotpKey, { headers });
    await expectRefusal(generated, 400, 'forbidden_strategy');

    const created = await call(createTotp, { body: { code: '123456' }, headers });
    await expectRefusal(created, 400, 'forbidden_strategy');
  });

  it('must not turn on MFA while TOTP is off', async () => {
    const user = await createTotpUser('totp-off-mfa@example.com');
    const headers = { ...defaultHeaders, Cookie: await createTestSession(user) };
    const { response: res, error } = await call(toggleMfa, { body: { mfaRequired: true }, headers });
    await expectRefusal({ response: res, error }, 400, 'forbidden_strategy');
  });

  it('should reject TOTP verification', async () => {
    const { response: res, error } = await call(signInWithTotp, { body: { code: '123456' }, headers: defaultHeaders });
    await expectRefusal({ response: res, error }, 400, 'forbidden_strategy');
  });
});

describe('all strategies disabled', async () => {
  beforeAll(() => {
    setTestConfig({ enabledAuthStrategies: [], selfRegistration: true });
  });
  const call = await createAppClient();

  it('should reject OAuth attempts', async () => {
    const { response: res, error } = await call(github, { query: {}, headers: defaultHeaders });
    await expectRefusal({ response: res, error }, 400, 'unsupported_oauth');
  });

  it('should reject passkey attempts', async () => {
    const refused = await passkeySignIn(softwarePasskey().assert('a-challenge'), '');
    await expectRefusal(refused, 400, 'forbidden_strategy');
  });
});

describe('passkey strategy disabled', () => {
  beforeAll(() => {
    setTestConfig({ enabledAuthStrategies: ['oauth', 'totp', 'magic'], selfRegistration: true });
  });

  it('must not verify a second factor with a passkey while passkeys are off', async () => {
    const user = await createTestUser('passkey-off-mfa@example.com');
    const mfaCookie = authCookie('confirm-mfa', await createMfaToken(user));
    const refused = await passkeySignIn(softwarePasskey().assert('a-challenge'), mfaCookie, 'mfa');
    await expectRefusal(refused, 400, 'forbidden_strategy');
  });
});
