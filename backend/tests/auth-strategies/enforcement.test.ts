import {
  generatePasskeyChallenge,
  generateTotpKey,
  github,
  google,
  microsoft,
  requestPassword,
  signIn,
  signInWithPasskey,
  signInWithTotp,
  signUp,
} from 'sdk';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defaultHeaders, signUpUser } from '../fixtures';
import { type ErrorResponse } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

// Global setup
beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => {
  await clearDatabase();
});

// Password strategy disabled
describe('password strategy disabled', async () => {
  beforeAll(() => {
    setTestConfig({
      enabledAuthStrategies: ['oauth', 'passkey', 'totp'],
      registrationEnabled: true,
    });
  });
  const call = await createAppClient();

  it.each([
    { name: 'signup', fn: signUp, opts: { body: signUpUser, headers: defaultHeaders } },
    {
      name: 'signin',
      fn: signIn,
      opts: { body: { email: 'test@example.com', password: 'password123' }, headers: defaultHeaders },
    },
    {
      name: 'password reset',
      fn: requestPassword,
      opts: { body: { email: 'test@example.com' }, headers: defaultHeaders },
    },
  ])('should reject password $name', async ({ fn, opts }) => {
    const { response: res, error } = await call(fn, opts);
    expect(res.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('forbidden_strategy');
  });
});

// OAuth strategy disabled
describe('oauth strategy disabled', async () => {
  beforeAll(() => {
    setTestConfig({
      enabledAuthStrategies: ['password', 'passkey', 'totp'],
      enabledOAuthProviders: [],
      registrationEnabled: true,
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

// OAuth provider configuration — only GitHub enabled
describe('oauth provider configuration', async () => {
  beforeAll(() => {
    setTestConfig({
      enabledAuthStrategies: ['oauth', 'password'],
      enabledOAuthProviders: ['github'],
      registrationEnabled: true,
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

// Passkey strategy disabled
describe('passkey strategy disabled', async () => {
  beforeAll(() => {
    setTestConfig({
      enabledAuthStrategies: ['password', 'oauth', 'totp'],
      registrationEnabled: true,
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
      body: {
        email: 'test@example.com',
        type: 'authentication',
        credentialId: 'test_id',
        clientDataJSON: '',
        authenticatorObject: '',
        signature: '',
      },
      headers: defaultHeaders,
    });
    expect(res.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('forbidden_strategy');
  });
});

// TOTP strategy disabled
describe('totp strategy disabled', async () => {
  beforeAll(() => {
    setTestConfig({
      enabledAuthStrategies: ['password', 'oauth', 'passkey'],
      registrationEnabled: true,
    });
  });
  const call = await createAppClient();

  it('should reject TOTP key generation', async () => {
    const { response: res } = await call(generateTotpKey, { headers: defaultHeaders });
    expect(res.status).toBe(401);
  });

  it('should reject TOTP verification', async () => {
    const { response: res, error } = await call(signInWithTotp, { body: { code: '123456' }, headers: defaultHeaders });
    expect(res.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('forbidden_strategy');
  });
});

// All strategies disabled
describe('all strategies disabled', async () => {
  beforeAll(() => {
    setTestConfig({
      enabledAuthStrategies: [],
      registrationEnabled: true,
    });
  });
  const call = await createAppClient();

  it('should reject password attempts', async () => {
    const { response: res, error } = await call(signUp, { body: signUpUser, headers: defaultHeaders });
    expect(res.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('forbidden_strategy');
  });

  it('should reject OAuth attempts', async () => {
    const { response: res, error } = await call(github, { query: {}, headers: defaultHeaders });
    expect(res.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('unsupported_oauth');
  });

  it('should reject passkey attempts', async () => {
    const { response: res, error } = await call(signInWithPasskey, {
      body: {
        email: 'test@example.com',
        type: 'authentication',
        credentialId: '',
        clientDataJSON: '',
        authenticatorObject: '',
        signature: '',
      },
      headers: defaultHeaders,
    });
    expect(res.status).toBe(400);
    expect((error as ErrorResponse).type).toBe('forbidden_strategy');
  });
});
