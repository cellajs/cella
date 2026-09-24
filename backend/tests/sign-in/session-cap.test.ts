import { and, eq, isNull } from 'drizzle-orm';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { evictExcessSessions } from '#/modules/auth/general/helpers/session';
import { type SessionTypes, sessionsTable } from '#/modules/auth/sessions-db';
import { hashToken } from '#/utils/hash-token';
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
    secret: hashToken(nanoid(40)),
    userId,
    type,
    authStrategy: 'passkey',
    createdAt: new Date(createdAtMs).toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  return id;
}

/** Ids of the user's sessions that still authenticate: revoked rows stay in the table but no longer count. */
const liveIds = (userId: string, type?: SessionTypes) =>
  db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.userId, userId),
        isNull(sessionsTable.revokedAt),
        type ? eq(sessionsTable.type, type) : undefined,
      ),
    )
    .then((rows) => new Set(rows.map((r) => r.id)));

describe('per-user session cap (A1)', () => {
  it('evicts the oldest regular sessions beyond the cap, leaving room for the pending new one', async () => {
    const user = await createTestUser('cap@example.com');
    const base = Date.now() - 100_000;
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(await insertSession(user.id, 'regular', base + i * 1000)); // oldest → newest

    await evictExcessSessions(user.id);

    const remaining = await liveIds(user.id, 'regular');
    // Called just before an insert, it leaves cap-1 so the new row brings the total to exactly the cap.
    expect(remaining.size).toBe(TEST_CAP - 1);
    // Survivors are the NEWEST cap-1; the oldest are revoked.
    expect(remaining.has(ids[4])).toBe(true);
    expect(remaining.has(ids[3])).toBe(true);
    expect(remaining.has(ids[0])).toBe(false);
    expect(remaining.has(ids[1])).toBe(false);

    // The evicted rows stay, stamped as the server's own housekeeping.
    const [evicted] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, ids[0]));
    expect(evicted).toMatchObject({ revocationReason: 'session_cap', revokedBy: null });
    expect(evicted.revokedAt).not.toBeNull();
  });

  it('counts mfa sessions toward the cap and never touches impersonation sessions', async () => {
    const user = await createTestUser('cap2@example.com');
    const base = Date.now() - 100_000;
    // An mfa session is the full session of a user with MFA on, so it is capped like a regular one.
    const mfaIds: string[] = [];
    for (let i = 0; i < 5; i++) mfaIds.push(await insertSession(user.id, 'mfa', base + i * 1000)); // oldest → newest
    const imperId = await insertSession(user.id, 'impersonation', base - 5000);

    await evictExcessSessions(user.id);

    const ids = await liveIds(user.id);
    expect(mfaIds.filter((id) => ids.has(id))).toEqual(mfaIds.slice(-(TEST_CAP - 1)));
    // The impersonation row is the oldest of all and still survives.
    expect(ids.has(imperId)).toBe(true);
  });

  it('does nothing when the user is at or below the cap', async () => {
    const user = await createTestUser('cap3@example.com');
    const base = Date.now() - 100_000;
    for (let i = 0; i < TEST_CAP - 1; i++) await insertSession(user.id, 'regular', base + i * 1000);

    await evictExcessSessions(user.id);

    expect((await liveIds(user.id, 'regular')).size).toBe(TEST_CAP - 1);
  });
});
