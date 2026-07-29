import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import type { DbContext } from '#/core/context';
import { baseDb } from '#/db/db';
import { requestsTable } from '#/modules/requests/requests-db';
import { findExistingRequest, insertRequest } from '#/modules/requests/requests-queries';

const ctx = { var: { db: baseDb } } as DbContext;
const email = 'query-request-uniqueness@example.com';

describe('request query uniqueness', () => {
  afterEach(async () => {
    await baseDb.delete(requestsTable).where(eq(requestsTable.email, email));
  });

  it('allows distinct signup types and finds each type precisely', async () => {
    await insertRequest(ctx, { email, type: 'waitlist' });
    await insertRequest(ctx, { email, type: 'newsletter' });

    await expect(findExistingRequest(ctx, { email, type: 'waitlist' })).resolves.toMatchObject({ type: 'waitlist' });
    await expect(findExistingRequest(ctx, { email, type: 'newsletter' })).resolves.toMatchObject({
      type: 'newsletter',
    });
  });

  it('enforces signup uniqueness case-insensitively at the database boundary', async () => {
    await insertRequest(ctx, { email, type: 'waitlist' });

    await expect(insertRequest(ctx, { email: email.toUpperCase(), type: 'waitlist' })).rejects.toThrow();
  });

  it('allows repeated contact requests', async () => {
    await insertRequest(ctx, { email, type: 'contact' });

    await expect(insertRequest(ctx, { email, type: 'contact' })).resolves.toMatchObject({ type: 'contact' });
  });
});
