import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';
import { hierarchy } from 'shared';
import { testDatabaseUrl } from 'shared/test-db';
import { buildTestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DocScope } from '../../constants';
import { buildSyncUpdate, createSignedToken, mapUpdate, openSocket, readMap, startRelayServer, until } from '../helpers';
import { cleanupSeed, seedAttachment, seedEntityHierarchy, seedMembership, seedOrg, seedUser, storedState } from './seed';

// The real upgrade handler, authorization, relay and storage over the real database (runtime_role); only the
// backend's materialize route and the connection limiter are stubbed.
vi.mock('../../server/rate-limiter', () => ({ checkConnectionRate: vi.fn(async () => true) }));
vi.mock('../../sync/materialize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../sync/materialize')>()),
  postMaterialize: vi.fn(async () => 'ok'),
}));

const tenantId = 'yjs-revoke-tenant';
const organizationId = '50000000-0000-4000-a000-000000000001';
const member = randomUUID();
const attachmentId = randomUUID();
const plan = buildTestEntityHierarchyPlan({ entityType: 'attachment', organizationId, makeChannelId: () => randomUUID() });
const scope: DocScope = { entityType: 'attachment', entityId: attachmentId, tenantId, organizationId };

let admin: pg.Client;
const relay = await startRelayServer();

beforeAll(async () => {
  admin = new pg.Client({ connectionString: testDatabaseUrl });
  await admin.connect();
  await seedUser(admin, member, 'revoke');
  await seedOrg(admin, tenantId, organizationId, 'yjs-revoke');
  await seedEntityHierarchy(admin, plan, tenantId, member, 'yjs-revoke');
  // A plain member, who may edit what they created: the attachment is theirs.
  await seedMembership(admin, tenantId, organizationId, member, hierarchy.getLeastPrivilegedRole('organization'));
  await seedAttachment(admin, attachmentId, tenantId, plan, member);
});

afterAll(async () => {
  await relay.close([scope]);
  await cleanupSeed(admin, { tenantIds: [tenantId], userIds: [member], plans: [plan] });
  await admin.end();
});

/** An open socket on the attachment with a token lasting `ttlMs`. */
function open(ttlMs: number) {
  const token = createSignedToken({
    userId: member,
    entityType: 'attachment',
    entityId: attachmentId,
    tenantId,
    organizationId,
    exp: Date.now() + ttlMs,
  });
  return openSocket(`${relay.baseUrl}/${attachmentId}?token=${token}&entityType=attachment&tenantId=${tenantId}`);
}

/** Every write the relay kept for the attachment, as one map. */
async function stored(): Promise<Record<string, unknown>> {
  const state = await storedState(scope);
  return state ? readMap(state) : {};
}

describe('revoking access reaches open sockets', () => {
  it('must not write through the relay via a socket whose membership was removed', async () => {
    // Positive control: the member edits their own attachment through the relay.
    const first = await open(2000);
    first.ws.send(buildSyncUpdate(mapUpdate('before', 1)));
    await until(async () => (await stored()).before === 1);

    await admin.query('DELETE FROM memberships WHERE user_id = $1 AND tenant_id = $2', [member, tenantId]);

    // The token's expiry closes the socket, however long the client meant to stay.
    expect(await first.closed).toEqual({ code: 4001, reason: 'Token expired' });

    // A token fetched before the revocation still verifies, but the relay authorizes against the row and memberships.
    const second = await open(5 * 60 * 1000);
    second.ws.send(buildSyncUpdate(mapUpdate('after', 2)));
    expect(await second.closed).toEqual({ code: 4003, reason: 'Access denied' });
    await sleep(100);
    expect(await stored()).toEqual({ before: 1 });
  });
});
