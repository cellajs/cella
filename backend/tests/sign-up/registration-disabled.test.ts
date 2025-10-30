import { testClient } from 'hono/testing';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defaultHeaders, signUpUser } from '../fixtures';
import { clearDatabase, migrateDatabase, mockFetchRequest, setTestConfig } from '../setup';

setTestConfig({
  registrationEnabled: false,
});

beforeAll(async () => {
  mockFetchRequest();
  await migrateDatabase();
});

afterEach(async () => {
  await clearDatabase();
});

describe('sign-up when "registrationEnabled" disabled', async () => {
  const { default: app } = await import('#/routes');
  const client = testClient(app);

  it('should not allow sign-up when "registrationEnabled" is disabled in config', async () => {
    const res = await client['auth']['sign-up'].$post({ json: signUpUser }, { headers: defaultHeaders });

    expect(res.status).toBe(403);
  });
});
