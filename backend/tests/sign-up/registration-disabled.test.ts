import { testClient } from 'hono/testing'
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mockFetchRequest, migrateDatabase, setTestConfig, clearDatabase, getAuthApp } from '../setup';
import { signUpUser, defaultHeaders } from '../fixtures';

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
  const app = await getAuthApp();
  const client = testClient(app);

  it('should not allow sign-up when "registrationEnabled" is disabled in config', async () => {
    const res = await client['auth']['sign-up'].$post(
      { json: signUpUser },
      { headers: defaultHeaders },
    );

    expect(res.status).toBe(403);
  });
});
