import { eq } from 'drizzle-orm';
import { checkEmail, signUp } from 'sdk';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { usersTable } from '#/db/schema/users';
import { defaultHeaders, signUpUser } from '../fixtures';
import { createPasswordUser } from '../helpers';
import { createAppClient } from '../test-client';
import { clearDatabase, mockFetchRequest, setTestConfig } from '../test-utils';

vi.mock('#/modules/auth/general/helpers/send-verification-email', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

setTestConfig({
  enabledAuthStrategies: ['password'],
  registrationEnabled: true,
});

beforeAll(async () => {
  mockFetchRequest();
});

afterEach(async () => {
  await clearDatabase();
});

describe('sign-up', async () => {
  const call = await createAppClient();

  it('should sign up a user', async () => {
    // Make simple sign-up request
    const { response } = await call(signUp, { body: signUpUser, headers: defaultHeaders });

    // Check the response status
    expect(response.status).toBe(201);

    // Check if the user was created in the database
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, signUpUser.email));
    expect(user).toBeDefined();
  });

  it('should fail the email check for unregistered email', async () => {
    const { response } = await call(checkEmail, { body: signUpUser, headers: defaultHeaders });

    expect(response.status).toBe(404);
  });

  it('should pass email check for an already registered email', async () => {
    // Create a user with the same email
    await createPasswordUser(signUpUser.email, signUpUser.password);

    const { response } = await call(checkEmail, { body: signUpUser, headers: defaultHeaders });

    expect(response.status).toBe(204);
  });

  it('should not allow duplicate emails', async () => {
    // Create a user with the same email
    await createPasswordUser(signUpUser.email, signUpUser.password);

    // Try to sign up again with the same email
    const { response } = await call(signUp, { body: signUpUser, headers: defaultHeaders });

    // Check the response status
    expect(response.status).toBe(409);
  });
});
