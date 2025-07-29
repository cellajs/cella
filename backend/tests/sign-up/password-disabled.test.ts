import { testClient } from 'hono/testing'
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '#/db/db';
import { mockFetchRequest, migrateDatabase, clearUsersTable, disableAuthStrategy } from '../utils';
import { signUpUser, defaultHeaders } from '../fixtures';
import { config } from 'config';
import { usersTable } from '#/db/schema/users';
import baseApp from '#/server';
import authRouteHandlers from '#/modules/auth/handlers';

const app = baseApp.route('/auth', authRouteHandlers);

beforeAll(async () => {
  mockFetchRequest();
  await migrateDatabase(db);
  disableAuthStrategy(config, 'password');
});

afterEach(async () => {
  await clearUsersTable(db, usersTable);
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
