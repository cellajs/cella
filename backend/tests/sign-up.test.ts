import path from 'node:path';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '#/db/db';
import { usersTable } from '#/db/schema/users';
import routes from '../src/routes';

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), 'drizzle') });
});

describe('sign-up', async () => {
  it('should sign up a user', async () => {
    const res = await routes.request('/auth/sign-up', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@gmail.com',
        password: 'password',
      }),
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, 'test@gmail.com'));
    expect(user).toBeDefined();
  });
});
