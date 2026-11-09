import { eq } from 'drizzle-orm';
import { updateUser } from 'sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { usersTable } from '#/modules/user/user-db';
import { defaultHeaders } from './fixtures';
import { createSystemAdminUser, createTestSession, createTestUser } from './helpers';
import { clearSecurityTestData } from './security/helpers';
import { createAppClient } from './test-client';

describe('System user update', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  it('keeps the name of a user with given and family name when the body changes the slug alone', async () => {
    const admin = await createSystemAdminUser('system-update-admin@example.test');
    const user = await createTestUser('system-update-target@example.test');
    const slug = `${user.slug}-renamed`;

    const { response } = await call(updateUser, {
      path: { userId: user.id },
      body: { slug },
      headers: { ...defaultHeaders, Cookie: await createTestSession(admin) },
    });
    expect(response.status).toBe(200);

    const [stored] = await db.select({ name: usersTable.name, slug: usersTable.slug }).from(usersTable).where(eq(usersTable.id, user.id));
    expect(stored).toEqual({ name: user.name, slug });
  });

  it('names a user without given or family name after a new slug', async () => {
    const admin = await createSystemAdminUser('system-update-admin@example.test');
    const user = await createTestUser('system-update-target@example.test');
    await db.update(usersTable).set({ givenName: null, familyName: null }).where(eq(usersTable.id, user.id));
    const slug = `${user.slug}-renamed`;

    const { response } = await call(updateUser, {
      path: { userId: user.id },
      body: { slug },
      headers: { ...defaultHeaders, Cookie: await createTestSession(admin) },
    });
    expect(response.status).toBe(200);

    const [stored] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, user.id));
    expect(stored.name).toBe(slug);
  });
});
