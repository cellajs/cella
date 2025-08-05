import { testClient } from 'hono/testing'
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mockFetchRequest, migrateDatabase, clearDatabase, setTestConfig, getAuthApp } from '../setup';
import { signUpUser, defaultHeaders } from '../fixtures';

setTestConfig({
  enabledAuthStrategies: [],
  registrationEnabled: true,
});

beforeAll(async () => {
  mockFetchRequest();
  await migrateDatabase();
});

afterEach(async () => {
  await clearDatabase();
});

describe('sign-up when "password" strategy is disabled', async () => {
  const app = await getAuthApp();
  const client = testClient(app);

  it('should not allow sign-up when "password" is disabled in config', async () => {
    const res = await client['auth']['sign-up'].$post(
      { json: signUpUser },
      { headers: defaultHeaders },
    );
    // Check the response
    console.log(res)
    console.log(await res.json())

    expect(res.status).toBe(400);
  });
});
