import { testClient } from 'hono/testing'
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '#/db/db';
import { mockFetchRequest, migrateDatabase, disableRegistration, clearUsersTable } from '../utils';
import { signUpUser, defaultHeaders } from '../fixtures';
import { usersTable } from '#/db/schema/users';
import { config } from 'config';
import baseApp from '#/server';
import authRouteHandlers from '#/modules/auth/handlers';

const app = baseApp.route('/auth', authRouteHandlers);

beforeAll(async () => {
  mockFetchRequest();
  await migrateDatabase(db);
  disableRegistration(config);
});

afterEach(async () => {
  await clearUsersTable(db, usersTable);
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
