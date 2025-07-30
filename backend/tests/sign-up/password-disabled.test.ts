import { testClient } from 'hono/testing'
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mockFetchRequest, migrateDatabase, clearDatabase, setTestConfig } from '../setup';
import { signUpUser, defaultHeaders } from '../fixtures';
import { authApp as app } from '../setup'

beforeAll(async () => {
  mockFetchRequest();
  await migrateDatabase();
  setTestConfig({
    enabledAuthStrategies: [],
  });
});

afterEach(async () => {
  await clearDatabase();
});

describe('sign-up when "password" strategy is disabled', () => {
  const client = testClient(app);

  it('should not allow sign-up when "password" is disabled in config', async () => {
    const res = await client['auth']['sign-up'].$post(
      { json: signUpUser },
      { headers: defaultHeaders },
    );
    // Check the response
    console.log(res)
    console.log(await res.json())

    expect(res.status).toBe(403);
  });
});
