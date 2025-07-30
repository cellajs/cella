import { testClient } from 'hono/testing'
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mockFetchRequest, migrateDatabase, setTestConfig, clearDatabase } from '../setup';
import { signUpUser, defaultHeaders } from '../fixtures';
import { authApp as app } from '../setup'

beforeAll(async () => {
  mockFetchRequest();
  await migrateDatabase();
  setTestConfig({
    registrationEnabled: false,
  });
});

afterEach(async () => {
  await clearDatabase();
});

describe('sign-up when "registrationEnabled" disabled', () => {
  const client = testClient(app);

  it('should not allow sign-up when "registrationEnabled" is disabled in config', async () => {
    const res = await client['auth']['sign-up'].$post(
      { json: signUpUser },
      { headers: defaultHeaders },
    );

    expect(res.status).toBe(403);
  });
});
