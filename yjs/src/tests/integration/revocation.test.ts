import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import pg from 'pg';
import { testDatabaseUrl } from 'shared/test-db';
import { buildTestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import type { DocScope } from '../../constants';
import { mergeState } from '../../sync/document-state';
import { buildSyncUpdate, createSignedToken, mapUpdate, readMap } from '../helpers';
import {
  cleanupEntityHierarchy,
  seedAttachment,
  seedEntityHierarchy,
  seedMembership,
  seedOrg,
  seedTenant,
  seedUser,
} from './seed';

// The real upgrade handler, authorization, relay and storage over the real database (runtime_role); only the
// backend's materialize route and the connection limiter are stubbed.
vi.mock('../../server/rate-limiter', () => ({ checkConnectionRate: vi.fn(async () => true) }));
vi.mock('../../sync/materialize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../sync/materialize')>()),
  postMaterialize: vi.fn(async () => 'ok'),
}));

const { setupConnectionHandler, setupUpgradeHandler } = await import('../../server/upgrade');
const { getCollab } = await import('../../sync/session-manager');
const { loadBase, readLog } = await import('../../data/storage');

const tenantId = 'yjs-revoke-tenant';
const organizationId = '50000000-0000-4000-a000-000000000001';
const member = randomUUID();
const attachmentId = randomUUID();
const plan = buildTestEntityHierarchyPlan({
  entityType: 'attachment',
  organizationId,
  makeChannelId: () => randomUUID(),
});
const scope: DocScope = { entityType: 'attachment', entityId: attachmentId, tenantId, organizationId };

let admin: pg.Client;
let httpServer: ReturnType<typeof createServer>;
let wss: WebSocketServer;
let baseUrl: string;

beforeAll(async () => {
  admin = new pg.Client({ connectionString: testDatabaseUrl });
  await admin.connect();
  await seedUser(admin, member, 'revoke');
  await seedTenant(admin, tenantId);
  await seedOrg(admin, tenantId, organizationId, 'yjs-revoke');
  await seedEntityHierarchy(admin, plan, tenantId, member, 'yjs-revoke');
  // A plain member, who may edit what they created: the attachment is theirs.
  await seedMembership(admin, tenantId, organizationId, member, 'member');
  await seedAttachment(admin, attachmentId, tenantId, plan, member);

  httpServer = createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', setupUpgradeHandler(wss));
  setupConnectionHandler(wss);
  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address();
      baseUrl = `ws://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
      resolve();
    });
  });
});

afterAll(async () => {
  for (const client of wss.clients) client.terminate();
  const collab = getCollab(scope);
  if (collab?.compactTimer) clearTimeout(collab.compactTimer);
  if (collab?.cleanupTimer) clearTimeout(collab.cleanupTimer);
  wss.close();
  httpServer.close();
  await admin.query('DELETE FROM yjs_updates WHERE tenant_id = $1', [tenantId]);
  await admin.query('DELETE FROM yjs_documents WHERE tenant_id = $1', [tenantId]);
  await admin.query('DELETE FROM attachments WHERE id = $1', [attachmentId]);
  await admin.query('DELETE FROM memberships WHERE tenant_id = $1', [tenantId]);
  await cleanupEntityHierarchy(admin, [plan]);
  await admin.query('DELETE FROM organizations WHERE id = $1', [organizationId]);
  await admin.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  await admin.query('DELETE FROM users WHERE id = $1', [member]);
  await admin.query('DELETE FROM actors WHERE id = $1', [member]);
  await admin.end();
});

/** An open socket on the attachment with a token lasting `ttlMs`; resolves once open, with its close code to come. */
async function open(ttlMs: number) {
  const token = createSignedToken({
    userId: member,
    entityType: 'attachment',
    entityId: attachmentId,
    tenantId,
    organizationId,
    exp: Date.now() + ttlMs,
  });
  const ws = new WsWebSocket(`${baseUrl}/${attachmentId}?token=${token}&entityType=attachment&tenantId=${tenantId}`);
  const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  return { ws, closed };
}

/** Every write the relay kept for the attachment: its base merged with its log, as one map. */
async function stored(): Promise<Record<string, unknown>> {
  const rows = await readLog(scope);
  const merged = mergeState(
    await loadBase(scope),
    rows.map((row) => row.payload),
  );
  return merged ? readMap(merged) : {};
}

async function until(check: () => Promise<boolean>, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe('revoking access reaches open sockets', () => {
  it('a socket stops writing once its membership is removed', async () => {
    // Positive control: the member edits their own attachment through the relay.
    const first = await open(2000);
    first.ws.send(buildSyncUpdate(mapUpdate('before', 1)));
    await until(async () => (await stored()).before === 1);

    await admin.query('DELETE FROM memberships WHERE user_id = $1 AND tenant_id = $2', [member, tenantId]);

    // The token's expiry closes the socket, however long the client meant to stay.
    expect(await first.closed).toBe(4001);

    // A token fetched before the revocation still verifies, but the relay authorizes against the row and memberships.
    const second = await open(5 * 60 * 1000);
    second.ws.send(buildSyncUpdate(mapUpdate('after', 2)));
    expect(await second.closed).toBe(4003);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await stored()).toEqual({ before: 1 });
  });
});
