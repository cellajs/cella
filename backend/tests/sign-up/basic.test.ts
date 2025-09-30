import { testClient } from 'hono/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defaultHeaders, signUpUser } from '../fixtures';
import { createUser, getUserByEmail } from '../helpers';
import { clearDatabase, getAuthApp, migrateDatabase, mockFetchRequest, setTestConfig } from '../setup';

setTestConfig({
  enabledAuthStrategies: ['password'],
  registrationEnabled: true,
});

beforeAll(async () => {
  mockFetchRequest();
  await migrateDatabase();

  // Tmp solution: Mock the sendVerificationEmail function to avoid background running tasks...
  // Later we should only mock the email sending part, not the whole function. 
  vi.mock('#/modules/auth/general/helpers/send-verification-email', () => ({
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined)
  }));
});

afterEach(async () => {
  await clearDatabase();
});

describe('sign-up', async () => {
  const app = await getAuthApp();
  const client = testClient(app);

  it('should sign up a user', async () => {

    // Make simple sing-up request
    const res = await client['auth']['sign-up'].$post(
      { json: signUpUser },
      { headers: defaultHeaders },
    );

    // Check the response status
    expect(res.status).toBe(200);

    // Check the response
    const data = await res.json();
    expect(data).toBe(true);

    // Check if the user was created in the database
    const [user] = await getUserByEmail(signUpUser.email);
    expect(user).toBeDefined();
  });

  it('should fail the email check for unregistered email', async () => {
    const res = await client['auth']['check-email'].$post(
      { json: signUpUser },
      { headers: defaultHeaders },
    );

    expect(res.status).toBe(404);
  });

  it('should pass email check for an already registered email', async () => {
    // Create a user with the same email
    await createUser(signUpUser.email, signUpUser.password);

    const res = await client['auth']['check-email'].$post(
      { json: signUpUser },
      { headers: defaultHeaders },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toBe(true);
  });

  it('should not allow duplicate emails', async () => {
    // Create a user with the same email
    await createUser(signUpUser.email, signUpUser.password);

    // Try to sign up again with the same email
    const res = await client['auth']['sign-up'].$post(
      { json: signUpUser },
      { headers: defaultHeaders },
    );

    // Check the response status
    expect(res.status).toBe(409);
  });
});