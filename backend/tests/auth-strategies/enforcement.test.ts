import {
  createTotp,
  generatePasskeyChallenge,
  generateTotpKey,
  github,
  google,
  microsoft,
  signInWithPasskey,
  signInWithTotp,
  toggleMfa,
} from 'sdk';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { defaultHeaders } from '../fixtures';
import {
  createMfaToken,
  createTestSession,
  createTestUser,
  createTotpUser,
  type ErrorResponse,
  passkeySignInBody,
} from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => {
  await clearDatabase();
});

describe('oauth strategy disabled', async () => {
  beforeAll(() => {
    setTestConfig({
      enabledAuthStrategies: ['passkey', 'totp'],
      enabledOAuthProviders: [],
      selfRegistration: true,
    });
  });
  const call = await createAppClient();

  it.each([
    { provider: 'github', fn: github },
    { provider: 'google', fn: google },
    { provider: 'microsoft', fn: microsoft },
  ])('should reject $provider OAuth initiation', async ({ provider, fn }) => {
    const { response: res, error } = await call(fn, { query: {}, headers: defaultHeaders });
    expect(res.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('unsupported_oauth');
    expect((error as ErrorResponse & { meta: Record<string, string> }).meta.strategy).toBe(provider);
  });
});

// OAuth provider configuration: only GitHub enabled.
describe('oauth provider configuration', async () => {
  beforeAll(() => {
    setTestConfig({
      enabledAuthStrategies: ['oauth'],
      enabledOAuthProviders: ['github'],
      selfRegistration: true,
    });
  });
  const call = await createAppClient();

  it('should allow enabled GitHub provider', async () => {
    const { response: res } = await call(github, { query: {}, headers: defaultHeaders });
    expect(res.status).not.toBe(400);
  });

  it.each([
    { provider: 'google', fn: google },
    { provider: 'microsoft', fn: microsoft },
  ])('should reject disabled $provider provider', async ({ provider, fn }) => {
    const { response: res, error } = await call(fn, { query: {}, headers: defaultHeaders });
    expect(res.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('unsupported_oauth');
    expect((error as ErrorResponse & { meta: Record<string, string> }).meta.strategy).toBe(provider);
  });
});

describe('passkey strategy disabled', async () => {
  beforeAll(() => {
    setTestConfig({
      enabledAuthStrategies: ['oauth', 'totp'],
      selfRegistration: true,
    });
  });
  const call = await createAppClient();

  it('should reject passkey generation', async () => {
    const { response: res, error } = await call(generatePasskeyChallenge, {
      body: { email: 'test@example.com', type: 'registration' },
      headers: defaultHeaders,
    });
    expect(res.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('forbidden_strategy');
  });

  it('should reject passkey authentication', async () => {
    const { response: res, error } = await call(signInWithPasskey, {
      body: passkeySignInBody({ credentialId: 'test_id', email: 'test@example.com' }),
      headers: defaultHeaders,
    });
    expect(res.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('forbidden_strategy');
  });
});

describe('totp strategy disabled', async () => {
  beforeAll(() => {
    setTestConfig({
      enabledAuthStrategies: ['oauth', 'passkey'],
      selfRegistration: true,
    });
  });
  const call = await createAppClient();

  // Signed in: the refusal must come from the strategy, not from the missing session.
  it('must not start TOTP enrollment via generateTotpKey while TOTP is off', async () => {
    const user = await createTestUser('totp-off@example.com');
    const headers = { ...defaultHeaders, Cookie: await createTestSession(user) };

    const generated = await call(generateTotpKey, { headers });
    expect(generated.response.status).toBe(400);
    expect((generated.error as ErrorResponse).type).toBe('forbidden_strategy');

    const created = await call(createTotp, { body: { code: '123456' }, headers });
    expect(created.response.status).toBe(400);
    expect((created.error as ErrorResponse).type).toBe('forbidden_strategy');
  });

  it('must not turn on MFA while TOTP is off', async () => {
    const user = await createTotpUser('totp-off-mfa@example.com');
    const headers = { ...defaultHeaders, Cookie: await createTestSession(user) };
    const { response: res, error } = await call(toggleMfa, {
      body: { mfaRequired: true, totpCode: '123456' },
      headers,
    });
    expect(res.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('forbidden_strategy');
  });

  it('should reject TOTP verification', async () => {
    const { response: res, error } = await call(signInWithTotp, { body: { code: '123456' }, headers: defaultHeaders });
    expect(res.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('forbidden_strategy');
  });
});

describe('all strategies disabled', async () => {
  beforeAll(() => {
    setTestConfig({
      enabledAuthStrategies: [],
      selfRegistration: true,
    });
  });
  const call = await createAppClient();

  it('should reject OAuth attempts', async () => {
    const { response: res, error } = await call(github, { query: {}, headers: defaultHeaders });
    expect(res.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('unsupported_oauth');
  });

  it('should reject passkey attempts', async () => {
    const { response: res, error } = await call(signInWithPasskey, {
      body: passkeySignInBody({ credentialId: '', email: 'test@example.com' }),
      headers: defaultHeaders,
    });
    expect(res.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('forbidden_strategy');
  });
});

describe('passkey strategy disabled', async () => {
  beforeAll(() => {
    setTestConfig({ enabledAuthStrategies: ['oauth', 'totp', 'magic'], selfRegistration: true });
  });
  const call = await createAppClient();

  it('must not verify a second factor with a passkey while passkeys are off', async () => {
    const user = await createTestUser('passkey-off-mfa@example.com');
    const mfaToken = await createMfaToken(user);
    const { response: res, error } = await call(signInWithPasskey, {
      body: { ...passkeySignInBody({ credentialId: 'x', email: user.email, type: 'mfa' }), email: undefined },
      headers: { ...defaultHeaders, Cookie: `${authCookieName('confirm-mfa')}=${mfaToken}` },
    });
    expect(res.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('forbidden_strategy');
  });

  it('must not issue a registration challenge while passkeys are off', async () => {
    const user = await createTestUser('passkey-off-register@example.com');
    const headers = { ...defaultHeaders, Cookie: await createTestSession(user) };
    const { response: res, error } = await call(generatePasskeyChallenge, { body: { type: 'registration' }, headers });
    expect(res.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('forbidden_strategy');
  });
});
