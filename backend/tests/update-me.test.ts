import { eq } from 'drizzle-orm';
import { updateMe } from 'sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { usersTable } from '#/modules/user/user-db';
import { defaultHeaders } from './fixtures';
import { createTestSession, createTestUser } from './helpers';
import { clearSecurityTestData } from './security/helpers';
import { createAppClient } from './test-client';

const nameOf = async (userId: string) => (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId)))[0]?.name;

describe('Self update', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  it('merges a changed first name over the stored last name, as the admin update does', async () => {
    const user = await createTestUser('update-me-name@example.test');
    await db.update(usersTable).set({ firstName: 'Ann', lastName: 'Smith', name: 'Ann Smith' }).where(eq(usersTable.id, user.id));
    const headers = { ...defaultHeaders, Cookie: await createTestSession(user) };

    expect((await call(updateMe, { body: { firstName: 'Anna' }, headers })).response.status).toBe(200);
    expect(await nameOf(user.id)).toBe('Anna Smith');

    // A cleared first name leaves the name too.
    expect((await call(updateMe, { body: { firstName: null }, headers })).response.status).toBe(200);
    expect(await nameOf(user.id)).toBe('Smith');
  });
});
