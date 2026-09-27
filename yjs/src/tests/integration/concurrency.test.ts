import { createServer } from 'node:http';
import pg from 'pg';
import { appConfig } from 'shared';
import { testDatabaseUrl } from 'shared/test-db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import type { DocScope } from '../../constants';
import { createSignedToken } from '../helpers';

// The real relay end to end over real sockets and the real database (runtime_role). The backend
// round trips are stubbed: access is granted in the requested scope, the description seeds from a
// fixed document, and the materialize POST is recorded. Sessions stamp their rows live every 100 ms.
vi.mock('../../constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../constants')>()),
  YJS_LIVE_TOUCH_MS: 100,
}));
vi.mock('../../data/permissions', () => ({
  authorizeDoc: vi.fn(async (_userId: string, requested: DocScope) => requested),
}));
vi.mock('../../server/rate-limiter', () => ({ checkConnectionRate: vi.fn(async () => true) }));
const materialized: { entityId: string; editedBy: string; description: string }[] = [];
vi.mock('../../sync/materialize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../sync/materialize')>();
  return {
    ...actual,
    postMaterialize: vi.fn(async (scope: DocScope, editors: string[], description: string) => {
      materialized.push({ entityId: scope.entityId, editedBy: editors[0], description });
      return 'ok';
    }),
  };
});
const seedDescription = JSON.stringify([
  {
    id: 'b1',
    type: 'paragraph',
    props: { backgroundColor: 'default', textColor: 'default', textAlignment: 'left' },
    content: [{ type: 'text', text: ' could you have a look?', styles: {} }],
    children: [],
  },
]);
vi.mock('../../data/entity-content', () => ({ loadEntityDescription: vi.fn(async () => seedDescription) }));

const { setupConnectionHandler, setupUpgradeHandler } = await import('../../server/upgrade');
const { runCompaction } = await import('../../sync/relay');
const { getCollab } = await import('../../sync/session-manager');
const { deleteDoc, loadBase, readLog } = await import('../../data/storage');
const { descriptionToYUpdate, yUpdateToBlocks } = await import('../../lib/blocknote-seed');

const DATABASE_URL = testDatabaseUrl;
const tenantId = 'yjs-e2e-tenant';
const organizationId = '00000000-0000-4000-a000-000000000031';
const userId = '00000000-0000-4000-a000-0000000000e2';
const entityType = appConfig.productEntityTypes[0];
const ids = {
  burst: '40000000-0000-4000-a000-000000000001',
  pull: '40000000-0000-4000-a000-000000000002',
  idle: '40000000-0000-4000-a000-000000000003',
  orphan: '40000000-0000-4000-a000-000000000004',
};

function ctx(entityId: string): DocScope {
  return { entityType, entityId, tenantId, organizationId };
}

/** Text of block 0 in a stored state. */
function textOf(state: Uint8Array): string {
  const blocks = yUpdateToBlocks(state) as { content: { type: string; text?: string }[] }[];
  return blocks[0].content.map((c) => c.text ?? '').join('');
}

let admin: pg.Client;
let httpServer: ReturnType<typeof createServer>;
let wss: WebSocketServer;
let baseUrl: string;

async function seedTenant() {
  await admin.query('INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [
    tenantId,
    'YJS E2E',
  ]);
  await admin.query(
    'INSERT INTO organizations (id, tenant_id, slug, name, short_name) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
    [organizationId, tenantId, 'yjs-e2e-org', 'YJS E2E Org', 'ye2'],
  );
}

async function cleanup() {
  for (const entityId of Object.values(ids)) {
    const collab = getCollab(ctx(entityId));
    if (collab?.compactTimer) clearTimeout(collab.compactTimer);
    if (collab?.cleanupTimer) clearTimeout(collab.cleanupTimer);
    if (collab?.liveTimer) clearInterval(collab.liveTimer);
    await deleteDoc(ctx(entityId));
  }
  await admin.query('DELETE FROM yjs_updates WHERE tenant_id = $1', [tenantId]);
  await admin.query('DELETE FROM yjs_documents WHERE tenant_id = $1', [tenantId]);
  await admin.query('DELETE FROM organizations WHERE tenant_id = $1', [tenantId]);
  await admin.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
}

beforeAll(async () => {
  admin = new pg.Client({ connectionString: DATABASE_URL });
  await admin.connect();
  await seedTenant();

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
  for (const client of wss.clients) client.close(1001);
  wss.close();
  httpServer.close();
  await cleanup();
  await admin.end();
});

/** A synced y-websocket client on the document. */
async function connectClient(entityId: string, doc = new Y.Doc()) {
  const token = createSignedToken({ userId, entityType, entityId, tenantId, organizationId });
  const provider = new WebsocketProvider(baseUrl, entityId, doc, {
    params: { token, entityType, tenantId },
    WebSocketPolyfill: WsWebSocket as never,
    disableBc: true,
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('sync timeout')), 5000);
    provider.once('sync', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  return { doc, provider };
}

function firstText(doc: Y.Doc): Y.XmlText {
  const find = (node: Y.XmlFragment | Y.XmlElement | Y.XmlText): Y.XmlText | null => {
    if (node instanceof Y.XmlText) return node;
    for (const child of node.toArray()) {
      const found = find(child as Y.XmlElement | Y.XmlText);
      if (found) return found;
    }
    return null;
  };
  const text = find(doc.getXmlFragment('document-store'));
  if (!text) throw new Error('no text node in seeded document');
  return text;
}

/** A relay generation started next to this one, as a start-first rollout does: its own sessions and pool, one database. */
async function startNextGeneration() {
  vi.resetModules();
  const { runStartupSweep } = await import('../../sync/sweep');
  const { closeDb } = await import('../../data/db');
  return { runStartupSweep, closeDb };
}

/** A session a crashed relay left behind: its base seeded from the description, one unwritten edit, both a day old. */
async function seedOrphan(entityId: string, edit: string) {
  const base = descriptionToYUpdate(seedDescription)!;
  const doc = new Y.Doc();
  Y.applyUpdate(doc, base);
  const before = Y.encodeStateVector(doc);
  firstText(doc).insert(0, edit);
  await admin.query(
    `INSERT INTO yjs_documents (entity_type, entity_id, tenant_id, organization_id, state, updated_at)
     VALUES ($1, $2, $3, $4, $5, now() - interval '1 day')`,
    [entityType, entityId, tenantId, organizationId, Buffer.from(base)],
  );
  await admin.query(
    `INSERT INTO yjs_updates (entity_type, entity_id, tenant_id, organization_id, user_id, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() - interval '1 day')`,
    [entityType, entityId, tenantId, organizationId, userId, Buffer.from(Y.encodeStateAsUpdate(doc, before))],
  );
}

const sessionRows = async (entityId: string) =>
  (await admin.query('SELECT 1 FROM yjs_documents WHERE entity_id = $1', [entityId])).rowCount;

const until = async (check: () => Promise<boolean>, ms = 3000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('condition not met in time');
};

describe('relay end to end', () => {
  it('a burst of keystrokes right after sync all persist and materialize (the lost-first-update regression)', async () => {
    const { doc, provider } = await connectClient(ids.burst);
    const text = firstText(doc);
    expect(text.toString()).toBe(' could you have a look?');

    // Three separate transactions dispatched back to back: three frames in one burst.
    for (const ch of ['c', 'b', 'a']) doc.transact(() => text.insert(0, ch));
    // The client's own sync reply can land as a fourth row; what matters is that all three keystrokes are logged.
    await until(async () => (await readLog(ctx(ids.burst))).length >= 3);
    provider.destroy();
    doc.destroy();

    const collab = getCollab(ctx(ids.burst))!;
    expect(await runCompaction(collab)).toBe('ok');

    expect(textOf((await loadBase(ctx(ids.burst)))!)).toBe('abc could you have a look?');
    expect(await readLog(ctx(ids.burst))).toEqual([]);
    expect(materialized.at(-1)?.editedBy).toBe(userId);
    expect(materialized.at(-1)?.description).toContain('abc could you have a look?');
  });

  it("must not delete an idle live session's rows via the startup sweep of another relay generation", async () => {
    const { doc, provider } = await connectClient(ids.idle);
    // A day passes with nothing logged, so the row and its log look stale; the live session stamps its row meanwhile.
    await admin.query("UPDATE yjs_documents SET updated_at = now() - interval '1 day' WHERE entity_id = $1", [
      ids.idle,
    ]);
    await admin.query("UPDATE yjs_updates SET created_at = now() - interval '1 day' WHERE entity_id = $1", [ids.idle]);
    await seedOrphan(ids.orphan, 'orphaned');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const next = await startNextGeneration();
    try {
      await next.runStartupSweep();
    } finally {
      await next.closeDb();
    }

    // The live session keeps its rows, so its next edit is written over the whole document.
    expect(await sessionRows(ids.idle)).toBe(1);
    const text = firstText(doc);
    text.insert(text.length, '!');
    await until(async () => (await readLog(ctx(ids.idle))).length >= 1);
    expect(await runCompaction(getCollab(ctx(ids.idle))!)).toBe('ok');
    expect(textOf((await loadBase(ctx(ids.idle)))!)).toBe(' could you have a look?!');
    const written = materialized.filter((entry) => entry.entityId === ids.idle).at(-1);
    expect(written?.description).toContain(' could you have a look?!');
    provider.destroy();
    doc.destroy();

    // Positive control: the orphan next to it, which no relay holds, is written and its rows go.
    expect(materialized.find((entry) => entry.entityId === ids.orphan)?.description).toContain(
      'orphaned could you have a look?',
    );
    expect(await sessionRows(ids.orphan)).toBe(0);
  });

  it('the relay pulls content a client already holds: an offline edit reaches the log on connect', async () => {
    // A client that edited before it could reach the relay: it holds structs the relay never saw.
    const offline = new Y.Doc();
    offline.getXmlFragment('document-store').insert(0, [new Y.XmlText('offline paragraph')]);

    const { doc, provider } = await connectClient(ids.pull, offline);
    await until(async () => (await readLog(ctx(ids.pull))).length >= 1);
    const rows = await readLog(ctx(ids.pull));
    expect(rows[0].userId).toBe(userId);
    // The merged document holds both the server seed and the client's content.
    const merged = Y.mergeUpdates([(await loadBase(ctx(ids.pull)))!, ...rows.map((row) => row.payload)]);
    const verify = new Y.Doc();
    Y.applyUpdate(verify, merged);
    expect(verify.getXmlFragment('document-store').toString()).toContain('offline paragraph');
    expect(verify.getXmlFragment('document-store').toString()).toContain('could you have a look?');
    provider.destroy();
    doc.destroy();
  });
});
