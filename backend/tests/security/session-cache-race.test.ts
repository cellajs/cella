import { nanoid } from 'nanoid';
import { getMe } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { revokeSessions } from '#/modules/auth/sessions/operations/revoke-sessions';
import { createTestUser } from '../helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData } from './helpers';
import { expectSignedOut, insertSession, warmSession } from './session-helpers';

/**
 * The session lookup, counted. While `held` is set, a lookup that has read its row waits for it before it answers, as
 * a slow database does.
 */
const lookup = vi.hoisted(() => ({ started: 0, read: 0, held: undefined as Promise<void> | undefined }));

vi.mock('#/modules/auth/sessions/sessions-queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/modules/auth/sessions/sessions-queries')>();
  return {
    ...actual,
    findSessionBySecret: async (...args: Parameters<typeof actual.findSessionBySecret>) => {
      lookup.started++;
      const found = await actual.findSessionBySecret(...args);
      lookup.read++;
      await lookup.held;
      return found;
    },
  };
});

/** Holds the answer of every lookup from now on; returns what lets them answer. */
function holdLookups() {
  let release = () => {};
  lookup.held = new Promise<void>((resolve) => {
    release = () => {
      lookup.held = undefined;
      resolve();
    };
  });
  return release;
}

afterEach(async () => {
  lookup.held = undefined;
  await clearSecurityTestData();
});

/**
 * A request that finds no cached session reads it and caches what it read. The read takes time, and the session can
 * change meanwhile: what was read before a revocation must not be cached after it, where it would serve for the cache's
 * 10 seconds.
 */
describe('a session read in flight', async () => {
  const call = await createAppClient();

  it('must not keep a revoked session live via a lookup that read it before the revocation', async () => {
    const user = await createTestUser(`race-${nanoid(8)}@security-test.com`);
    const [revoked, other] = [await insertSession(user), await insertSession(user)];

    // A request reads the session while it is live, and the database's answer arrives after the revocation.
    const readBefore = lookup.read;
    const release = holdLookups();
    const inFlight = call(getMe, { headers: revoked.headers });
    await vi.waitFor(() => expect(lookup.read).toBe(readBefore + 1));

    // No session of the user is cached yet, so the revocation finds no entry to drop.
    const ended = await revokeSessions({ var: { db } }, { userId: user.id, sessionIds: [revoked.id], reason: 'other_session', by: user.id });
    expect(ended.map((session) => session.id)).toEqual([revoked.id]);
    release();
    // The request that was in flight is answered with the session it read.
    expect((await inFlight).response.status).toBe(200);

    await expectSignedOut(revoked.cookie, 'session_revoked');
    // Positive control: the user's other session is read and served.
    await warmSession(other);
  });

  it('reads the session once for a burst of requests that finds it uncached', async () => {
    const user = await createTestUser(`burst-${nanoid(8)}@security-test.com`);
    const session = await insertSession(user);

    const [startedBefore, readBefore] = [lookup.started, lookup.read];
    const release = holdLookups();
    const burst = Array.from({ length: 20 }, () => call(getMe, { headers: session.headers }));
    // Every request of the burst reaches the lookup, or the one in flight, before the database answers.
    await vi.waitFor(() => expect(lookup.read).toBeGreaterThan(readBefore));
    await new Promise((resolve) => setTimeout(resolve, 100));
    release();

    for (const { response } of await Promise.all(burst)) expect(response.status).toBe(200);
    expect(lookup.started - startedBefore).toBe(1);
  });
});
