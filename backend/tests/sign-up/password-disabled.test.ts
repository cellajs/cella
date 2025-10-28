import { testClient } from 'hono/testing';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defaultHeaders, signUpUser } from '../fixtures';
import { clearDatabase, getAuthApp, migrateDatabase, mockFetchRequest, setTestConfig } from '../setup';

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
    const res = await client['auth']['sign-up'].$post({ json: signUpUser }, { headers: defaultHeaders });
    // Check the response
    console.debug(res);
    console.debug(await res.json());

    expect(res.status).toBe(400);
  });
});
