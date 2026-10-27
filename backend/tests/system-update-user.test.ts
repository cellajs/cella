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

  it('keeps the name when the body changes neither the first nor the last name', async () => {
    const admin = await createSystemAdminUser('system-update-admin@example.test');
    const user = await createTestUser('system-update-target@example.test');
    const slug = `${user.slug}-renamed`;

    const { response } = await call(updateUser, {
      path: { id: user.id },
      body: { slug },
      headers: { ...defaultHeaders, Cookie: await createTestSession(admin) },
    });
    expect(response.status).toBe(200);

    const [stored] = await db.select({ name: usersTable.name, slug: usersTable.slug }).from(usersTable).where(eq(usersTable.id, user.id));
    expect(stored).toEqual({ name: user.name, slug });
  });
});
