import { testClient } from 'hono/testing';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defaultHeaders, signUpUser } from '../fixtures';
import { parseResponse } from '../helpers';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

// Password strategy disabled
describe('password strategy disabled', async () => {
  beforeAll(() => {
    setTestConfig({
      enabledAuthStrategies: ['oauth', 'passkey', 'totp'], // No password
      registrationEnabled: true,
    });
  });
  const { default: app } = await import('#/routes');
  const client = testClient(app);

  it('should reject password signup', async () => {
    const res = await client.auth['sign-up'].$post({ json: signUpUser }, { headers: defaultHeaders });
    expect(res.status).toBe(400);

    const response = await parseResponse<{ type: string }>(res);
    expect(response.type).toBe('forbidden_strategy');
  });

  it('should reject password signin', async () => {
    const res = await client.auth['sign-in'].$post(
      { json: { email: 'test@example.com', password: 'password123' } },
      { headers: defaultHeaders },
    );
    expect(res.status).toBe(400);
    const response = await parseResponse<{ type: string }>(res);
    expect(response.type).toBe('forbidden_strategy');
  });

  it('should reject password reset requests', async () => {
    const res = await client.auth['request-password'].$post(
      { json: { email: 'test@example.com' } },
      { headers: defaultHeaders },
    );
    expect(res.status).toBe(400);

    const response = await parseResponse<{ type: string }>(res);
    expect(response.type).toBe('forbidden_strategy');
  });
});

// OAuth strategy disabled
describe('oauth strategy disabled', async () => {
  beforeAll(() => {
    setTestConfig({
      enabledAuthStrategies: ['password', 'passkey', 'totp'], // No oauth
      enabledOAuthProviders: [],
      registrationEnabled: true,
    });
  });

  const { default: app } = await import('#/routes');
  const client = testClient(app);

  it('should reject GitHub OAuth initiation', async () => {
    const res = await client.auth.github.$get({ query: {} }, { headers: defaultHeaders });
    expect(res.status).toBe(400);
    const response = await parseResponse<{ type: string; meta: Record<string, string> }>(res);
    expect(response.type).toBe('unsupported_oauth');
    expect(response.meta.strategy).toBe('github');
  });

  it('should reject Google OAuth initiation', async () => {
    const res = await client.auth.google.$get({ query: {} }, { headers: defaultHeaders });
    expect(res.status).toBe(400);
    const response = await parseResponse<{ type: string; meta: Record<string, string> }>(res);
    expect(response.type).toBe('unsupported_oauth');
    expect(response.meta.strategy).toBe('google');
  });

  it('should reject Microsoft OAuth initiation', async () => {
    const res = await client.auth.microsoft.$get({ query: {} }, { headers: defaultHeaders });
    expect(res.status).toBe(400);
    const response = await parseResponse<{ type: string; meta: Record<string, string> }>(res);
    expect(response.type).toBe('unsupported_oauth');
    expect(response.meta.strategy).toBe('microsoft');
  });
});
describe('oauth provider configuration', async () => {
  beforeAll(() => {
    setTestConfig({
      enabledAuthStrategies: ['oauth', 'password'],
      enabledOAuthProviders: ['github'], // Only GitHub enabled
      registrationEnabled: true,
    });
  });
  const { default: app } = await import('#/routes');
  const client = testClient(app);

  it('should allow enabled GitHub provider', async () => {
    const res = await client.auth.github.$get(
      {
        query: {},
      },
      { headers: defaultHeaders },
    );
    expect(res.status).not.toBe(400); // Should not return unsupported_oauth error
  });

  it('should reject disabled Google provider', async () => {
    const res = await client.auth.google.$get({ query: {} }, { headers: defaultHeaders });
    expect(res.status).toBe(400);
    const response = await parseResponse<{ type: string; meta: Record<string, string> }>(res);

    expect(response.type).toBe('unsupported_oauth');
    expect(response.meta.strategy).toBe('google');
  });

  it('should reject disabled Microsoft provider', async () => {
    const res = await client.auth.microsoft.$get({ query: {} }, { headers: defaultHeaders });
    expect(res.status).toBe(400);
    const response = await parseResponse<{ type: string; meta: Record<string, string> }>(res);

    expect(response.type).toBe('unsupported_oauth');
    expect(response.meta.strategy).toBe('microsoft');
  });
});

// Passkey strategy disabled
describe('passkey strategy disabled', async () => {
  beforeAll(() => {
    setTestConfig({
      enabledAuthStrategies: ['password', 'oauth', 'totp'], // No passkey
      registrationEnabled: true,
    });
  });
  const { default: app } = await import('#/routes');
  const client = testClient(app);

  it('should reject passkey generation', async () => {
    const res = await client.auth['passkey']['generate-challenge'].$post(
      { json: { email: 'test@example.com', type: 'registration' } },
      { headers: defaultHeaders },
    );
    expect(res.status).toBe(400);
    const response = await parseResponse<{ type: string }>(res);
    expect(response.type).toBe('forbidden_strategy');
  });

  it('should reject passkey authentication', async () => {
    const res = await client.auth['passkey-verification'].$post(
      {
        json: {
          email: 'test@example.com',
          type: 'authentication',
          credentialId: 'test_id',
          clientDataJSON: '',
          authenticatorObject: '',
          signature: '',
        },
      },
      { headers: defaultHeaders },
    );
    expect(res.status).toBe(400);
    const response = await parseResponse<{ type: string }>(res);
    expect(response.type).toBe('forbidden_strategy');
  });
});

describe('totp strategy disabled', async () => {
  beforeAll(() => {
    setTestConfig({
      enabledAuthStrategies: ['password', 'oauth', 'passkey'], // No totp
      registrationEnabled: true,
    });
  });
  const { default: app } = await import('#/routes');
  const client = testClient(app);

  it('should reject TOTP key generation', async () => {
    const res = await client.auth['totp']['generate-key'].$post({}, { headers: defaultHeaders });
    expect(res.status).toBe(401); // TOTP requires authentication first
  });

  it('should reject TOTP verification', async () => {
    const res = await client.auth['totp-verification'].$post({ json: { code: '123456' } }, { headers: defaultHeaders });
    expect(res.status).toBe(400);
    const response = await parseResponse<{ type: string }>(res);

    expect(response.type).toBe('forbidden_strategy');
  });
});

describe('all strategies disabled', async () => {
  beforeAll(() => {
    setTestConfig({
      enabledAuthStrategies: [], // No strategies enabled
      registrationEnabled: true,
    });
  });
  const { default: app } = await import('#/routes');
  const client = testClient(app);

  it('should reject password attempts', async () => {
    const res = await client.auth['sign-up'].$post({ json: signUpUser }, { headers: defaultHeaders });
    expect(res.status).toBe(400);
    const response = await parseResponse<{ type: string }>(res);

    expect(response.type).toBe('forbidden_strategy');
  });

  it('should reject OAuth attempts', async () => {
    const res = await client.auth.github.$get({ query: {} }, { headers: defaultHeaders });
    expect(res.status).toBe(400);

    const response = await parseResponse<{ type: string }>(res);
    expect(response.type).toBe('unsupported_oauth');
  });

  it('should reject passkey attempts', async () => {
    const res = await client.auth['passkey-verification'].$post(
      {
        json: {
          email: 'test@example.com',
          type: 'authentication',
          credentialId: '',
          clientDataJSON: '',
          authenticatorObject: '',
          signature: '',
        },
      },
      { headers: defaultHeaders },
    );
    expect(res.status).toBe(400);
    const response = await parseResponse<{ type: string }>(res);

    expect(response.type).toBe('forbidden_strategy');
  });
});

// Global setup
beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => {
  await clearDatabase();
});
