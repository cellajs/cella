import { and, eq } from 'drizzle-orm';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { evictExcessSessions } from '#/modules/auth/general/helpers/session';
import { type SessionTypes, sessionsTable } from '#/modules/auth/sessions-db';
import { encodeLowerCased } from '#/utils/oslo';
import { createTestUser } from '../helpers';
import { clearDatabase } from '../test-utils';

// A small cap keeps the test fast and the arithmetic obvious. Restore the default afterwards so the
// override does not leak into other test files sharing the appConfig singleton.
const TEST_CAP = 3;
const originalCap = appConfig.maxSessionsPerUser;
(appConfig as unknown as { maxSessionsPerUser: number }).maxSessionsPerUser = TEST_CAP;
afterAll(() => {
  (appConfig as unknown as { maxSessionsPerUser: number }).maxSessionsPerUser = originalCap;
});

afterEach(async () => await clearDatabase());

/** Insert a session row directly (bypassing setUserSession) with a controllable createdAt. */
async function insertSession(userId: string, type: SessionTypes, createdAtMs: number) {
  const id = generateId();
  await db.insert(sessionsTable).values({
    id,
    secret: encodeLowerCased(nanoid(40)),
    userId,
    type,
    authStrategy: 'passkey',
    createdAt: new Date(createdAtMs).toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  return id;
}

const regularIds = (userId: string) =>
  db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.userId, userId), eq(sessionsTable.type, 'regular')))
    .then((rows) => new Set(rows.map((r) => r.id)));

describe('per-user session cap (A1)', () => {
  it('evicts the oldest regular sessions beyond the cap, leaving room for the pending new one', async () => {
    const user = await createTestUser('cap@example.com');
    const base = Date.now() - 100_000;
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(await insertSession(user.id, 'regular', base + i * 1000)); // oldest → newest

    await evictExcessSessions(user.id);

    const remaining = await regularIds(user.id);
    // Called just before an insert, it leaves cap-1 so the new row brings the total to exactly the cap.
    expect(remaining.size).toBe(TEST_CAP - 1);
    // Survivors are the NEWEST cap-1; the oldest are gone.
    expect(remaining.has(ids[4])).toBe(true);
    expect(remaining.has(ids[3])).toBe(true);
    expect(remaining.has(ids[0])).toBe(false);
    expect(remaining.has(ids[1])).toBe(false);
  });

  it('never counts or evicts mfa/impersonation sessions', async () => {
    const user = await createTestUser('cap2@example.com');
    const base = Date.now() - 100_000;
    for (let i = 0; i < 5; i++) await insertSession(user.id, 'regular', base + i * 1000);
    const mfaId = await insertSession(user.id, 'mfa', base - 5000);
    const imperId = await insertSession(user.id, 'impersonation', base - 5000);

    await evictExcessSessions(user.id);

    const all = await db.select({ id: sessionsTable.id }).from(sessionsTable).where(eq(sessionsTable.userId, user.id));
    const ids = new Set(all.map((r) => r.id));
    // The two oldest rows overall are mfa/impersonation, yet both survive — they are excluded from the cap.
    expect(ids.has(mfaId)).toBe(true);
    expect(ids.has(imperId)).toBe(true);
  });

  it('does nothing when the user is at or below the cap', async () => {
    const user = await createTestUser('cap3@example.com');
    const base = Date.now() - 100_000;
    for (let i = 0; i < TEST_CAP - 1; i++) await insertSession(user.id, 'regular', base + i * 1000);

    await evictExcessSessions(user.id);

    expect((await regularIds(user.id)).size).toBe(TEST_CAP - 1);
  });
});
