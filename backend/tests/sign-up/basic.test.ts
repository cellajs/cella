import { eq } from 'drizzle-orm';
import { testClient } from 'hono/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '#/db/db';
import { usersTable } from '#/db/schema/users';
import { defaultHeaders, signUpUser } from '../fixtures';
import { createPasswordUser } from '../helpers';
import { clearDatabase, migrateDatabase, mockFetchRequest, setTestConfig } from '../setup';

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
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  }));
});

afterEach(async () => {
  await clearDatabase();
});

describe('sign-up', async () => {
  const { default: app } = await import('#/routes');
  const client = testClient(app);

  it('should sign up a user', async () => {
    // Make simple sing-up request
    const res = await client['auth']['sign-up'].$post({ json: signUpUser }, { headers: defaultHeaders });

    // Check the response status
    expect(res.status).toBe(201);

    // Check if the user was created in the database
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, signUpUser.email));
    expect(user).toBeDefined();
  });

  it('should fail the email check for unregistered email', async () => {
    const res = await client['auth']['check-email'].$post({ json: signUpUser }, { headers: defaultHeaders });

    expect(res.status).toBe(404);
  });

  it('should pass email check for an already registered email', async () => {
    // Create a user with the same email
    await createPasswordUser(signUpUser.email, signUpUser.password);

    const res = await client['auth']['check-email'].$post({ json: signUpUser }, { headers: defaultHeaders });

    expect(res.status).toBe(204);
  });

  it('should not allow duplicate emails', async () => {
    // Create a user with the same email
    await createPasswordUser(signUpUser.email, signUpUser.password);

    // Try to sign up again with the same email
    const res = await client['auth']['sign-up'].$post({ json: signUpUser }, { headers: defaultHeaders });

    // Check the response status
    expect(res.status).toBe(409);
  });
});
