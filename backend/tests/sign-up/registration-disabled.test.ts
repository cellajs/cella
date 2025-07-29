import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '#/db/db';
import { mockFetchRequest, migrateDatabase, disableRegistration, clearUsersTable } from '../utils/setup';

import { user as signUpUser } from '../fixtures/sign-up';
import { defaultHeaders } from '../fixtures/headers';
import { usersTable } from '../../src/db/schema/users';
import { config } from 'config';

beforeAll(async () => {
  mockFetchRequest();
  await migrateDatabase(db);
  disableRegistration(config);
});

afterEach(async () => {
  await clearUsersTable(db, usersTable);
});

describe('sign-up when "registrationEnabled" disabled', () => {
  it('should not allow sign-up when "registrationEnabled" is disabled in config', async () => {
    const { default: routes } = await import('../../src/routes'); // import after config patch

    const res = await routes.request('/auth/sign-up', {
      method: 'POST',
      body: JSON.stringify(signUpUser),
      headers: new Headers(defaultHeaders),
    });

    expect(res.status).toBe(403);
  });
});
