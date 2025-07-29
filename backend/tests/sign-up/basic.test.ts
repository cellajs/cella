import { testClient } from 'hono/testing'
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mockFetchRequest, migrateDatabase, clearUsersTable, enableRegistration, enableAuthStrategy, clearEmailsTable } from '../utils';
import { signUpUser, defaultHeaders } from '../fixtures';
import { getUserByEmail, createUser } from '../helpers';
import { usersTable } from '#/db/schema/users';
import { db } from '#/db/db';
import { config } from 'config';
import { emailsTable } from '#/db/schema/emails';
import baseApp from '#/server';
import authRouteHandlers from '#/modules/auth/handlers';

const app = baseApp.route('/auth', authRouteHandlers);

beforeAll(async () => {
  mockFetchRequest();
  await migrateDatabase(db);
  enableAuthStrategy(config, 'password');
  enableRegistration(config);
});

afterEach(async () => {
  await clearUsersTable(db, usersTable);
  await clearEmailsTable(db, emailsTable);
});

describe('sign-up', async () => {
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
    expect(res.status).toBe(500);
  });
});