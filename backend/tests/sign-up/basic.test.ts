import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import routes from '../../src/routes';
import { mockFetchRequest, migrateDatabase, clearUsersTable, enableRegistration, enableAuthStrategy } from '../utils/setup';
import { user as signUpUser } from '../fixtures/sign-up';
import { defaultHeaders } from '../fixtures/headers';
import { getUserByEmail } from '../helpers/get-user';
import { createUser } from '../helpers/create-user';
import { usersTable } from '../../src/db/schema/users';
import { db } from '../../src/db/db';
import { config } from 'config';

beforeAll(async () => {
  mockFetchRequest();
  await migrateDatabase(db);
  enableAuthStrategy(config, 'password');
  enableRegistration(config);
});

afterEach(async () => {
  await clearUsersTable(db, usersTable);
});

describe('sign-up', async () => {
  it('should sign up a user', async () => {
    // Make simple sing-up request
    const res = await routes.request('/auth/sign-up', {
      method: 'POST',
      body: JSON.stringify(signUpUser),
      headers: new Headers(defaultHeaders),
    });

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
    const res = await routes.request('/auth/check-email', {
      method: 'POST',
      body: JSON.stringify(signUpUser),
      headers: new Headers(defaultHeaders),
    });

    expect(res.status).toBe(404);
  });

  it('should pass email check for an already registered email', async () => {
    // Create a user with the same email
    await createUser(signUpUser.email, signUpUser.password);

    const res = await routes.request('/auth/check-email', {
      method: 'POST',
      body: JSON.stringify(signUpUser),
      headers: new Headers(defaultHeaders),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toBe(true);
  });


  it('should not allow duplicate emails', async () => {
    // Create a user with the same email
    await createUser(signUpUser.email, signUpUser.password);

    // Try to sign up again with the same email
    const res = await routes.request('/auth/sign-up', {
      method: 'POST',
      body: JSON.stringify(signUpUser),
      headers: new Headers(defaultHeaders),
    });

    // Check the response status
    expect(res.status).toBe(500);

    // Check the response message
    const data = await res.json();
    expect(data.message).toBe('');
  });
});