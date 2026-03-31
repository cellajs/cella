import { signUp } from 'sdk';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defaultHeaders, signUpUser } from '../fixtures';
import { createTestClient, sdk } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

setTestConfig({
  enabledAuthStrategies: [],
  registrationEnabled: true,
});

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => {
  await clearDatabase();
});

describe('sign-up when "password" strategy is disabled', async () => {
  const { default: app } = await import('#/routes');
  const call = sdk(createTestClient(app));

  it('should not allow sign-up when "password" is disabled in config', async () => {
    const { response } = await call(signUp, { body: signUpUser, headers: defaultHeaders });

    expect(response.status).toBe(400);
  });
});
