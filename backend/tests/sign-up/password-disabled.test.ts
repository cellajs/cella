import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '#/db/db';
import { mockFetchRequest, migrateDatabase, clearUsersTable, disableAuthStrategy } from '../utils/setup';

import { user as signUpUser } from '../fixtures/sign-up';
import { defaultHeaders } from '../fixtures/headers';
import { config } from 'config';
import { usersTable } from '../../src/db/schema/users';

beforeAll(async () => {
  mockFetchRequest();
  await migrateDatabase(db);
  disableAuthStrategy(config, 'password');
});

afterEach(async () => {
  await clearUsersTable(db, usersTable);
});

describe('sign-up when "password" strategy is disabled', () => {
  it('should not allow sign-up when "password" is disabled in config', async () => {
    const { default: routes } = await import('../../src/routes'); // import after config patch

    const res = await routes.request('/auth/sign-up', {
      method: 'POST',
      body: JSON.stringify(signUpUser),
      headers: new Headers(defaultHeaders),
    });

    expect(res.status).toBe(400);
  });
});
