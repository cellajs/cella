import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import type { DbContext } from '#/core/context';
import { baseDb } from '#/db/db';
import { requestsTable } from '#/modules/requests/requests-db';
import { insertRequest } from '#/modules/requests/requests-queries';

const ctx = { var: { db: baseDb } } as DbContext;
const email = 'query-request-uniqueness@example.com';

describe('request query uniqueness', () => {
  afterEach(async () => {
    // Case-insensitive cleanup: an exact-match delete leaves the uppercase variant and trips the unique signup index.
    await baseDb.delete(requestsTable).where(sql`lower(${requestsTable.email}) = lower(${email})`);
  });

  it('allows distinct signup kinds for one address', async () => {
    await expect(insertRequest(ctx, { email, kind: 'waitlist' })).resolves.toMatchObject({ kind: 'waitlist' });
    await expect(insertRequest(ctx, { email, kind: 'info' })).resolves.toMatchObject({ kind: 'info' });
  });

  it('swallows duplicate signups case-insensitively at the database boundary', async () => {
    await insertRequest(ctx, { email, kind: 'waitlist' });

    await expect(insertRequest(ctx, { email: email.toUpperCase(), kind: 'waitlist' })).resolves.toBeUndefined();
  });

  it('allows repeated contact requests', async () => {
    await insertRequest(ctx, { email, kind: 'contact' });

    await expect(insertRequest(ctx, { email, kind: 'contact' })).resolves.toMatchObject({ kind: 'contact' });
  });
});
