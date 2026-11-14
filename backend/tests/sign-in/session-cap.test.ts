import { and, eq, isNull } from 'drizzle-orm';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { revokeExcessSessions } from '#/modules/auth/sessions/operations/create-session';
import { type SessionKind, sessionsTable } from '#/modules/auth/sessions/sessions-db';
import { overrideConfig } from '../fixtures';
import { createTestUser, insertTestSession, sessionRow } from '../helpers';
import { clearDatabase } from '../test-utils';

// A small cap keeps the test fast and the arithmetic obvious.
const TEST_CAP = 3;
overrideConfig(appConfig, { maxSessionsPerUser: TEST_CAP });

afterEach(async () => await clearDatabase());

/** A session row of `kind` signed in `ageMs` ago, inserted past setUserSession so no cap applies yet. */
const insertSession = async (user: { id: string }, kind: SessionKind, ageMs: number) => (await insertTestSession(user, { kind, ageMs })).id;

/** Ids of the user's sessions that still authenticate: revoked rows stay in the table but no longer count. */
const liveIds = (userId: string, kind?: SessionKind) =>
  db
    .select({ id: sessionsTable.id })
    .from(sessionsTable)
    .where(and(eq(sessionsTable.userId, userId), isNull(sessionsTable.revokedAt), kind ? eq(sessionsTable.kind, kind) : undefined))
    .then((rows) => new Set(rows.map((r) => r.id)));

describe('per-user session cap (A1)', () => {
  it('revokes the oldest regular sessions beyond the cap, leaving room for the pending new one', async () => {
    const user = await createTestUser('cap@example.com');
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(await insertSession(user, 'regular', 100_000 - i * 1000)); // oldest → newest

    await revokeExcessSessions(user.id);

    const remaining = await liveIds(user.id, 'regular');
    // Called just before an insert, it leaves cap-1 so the new row brings the total to exactly the cap.
    expect(remaining.size).toBe(TEST_CAP - 1);
    // Survivors are the NEWEST cap-1; the oldest are revoked.
    expect(remaining.has(ids[4])).toBe(true);
    expect(remaining.has(ids[3])).toBe(true);
    expect(remaining.has(ids[0])).toBe(false);
    expect(remaining.has(ids[1])).toBe(false);

    // The revoked rows stay, stamped as the server's own housekeeping.
    const revoked = await sessionRow(ids[0]);
    expect(revoked).toMatchObject({ revocationReason: 'session_cap', revokedBy: null });
    expect(revoked.revokedAt).not.toBeNull();
  });

  it('counts mfa sessions toward the cap', async () => {
    const user = await createTestUser('cap2@example.com');
    // An mfa session is the full session of a user with MFA on, so it is capped like a regular one.
    const mfaIds: string[] = [];
    for (let i = 0; i < 5; i++) mfaIds.push(await insertSession(user, 'mfa', 100_000 - i * 1000)); // oldest → newest

    await revokeExcessSessions(user.id);

    const ids = await liveIds(user.id);
    expect(mfaIds.filter((id) => ids.has(id))).toEqual(mfaIds.slice(-(TEST_CAP - 1)));
  });

  it('does nothing when the user is at or below the cap', async () => {
    const user = await createTestUser('cap3@example.com');
    for (let i = 0; i < TEST_CAP - 1; i++) await insertSession(user, 'regular', 100_000 - i * 1000);

    await revokeExcessSessions(user.id);

    expect((await liveIds(user.id, 'regular')).size).toBe(TEST_CAP - 1);
  });
});
