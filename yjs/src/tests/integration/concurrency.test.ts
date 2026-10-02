import { setTimeout as sleep } from 'node:timers/promises';
import * as decoding from 'lib0/decoding';
import pg from 'pg';
import { appConfig } from 'shared';
import { testDatabaseUrl } from 'shared/test-db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocket as WsWebSocket } from 'ws';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import type { DocScope } from '../../constants';
import { createSignedToken, startRelayServer, until } from '../helpers';
import { appendOutsideWrite, cleanupSeed, outsideUpdate, seedOrg, storedState } from './seed';

// The real relay end to end over real sockets and the real database (runtime_role). The backend round trips are
// stubbed: access is granted in the requested scope, the description seeds from a document the test can rewrite, and
// the materialize POST is recorded. Sessions stamp their rows live every 100 ms; cleanup runs 500 ms after the last leave.
vi.mock('../../constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../constants')>()),
  YJS_LIVE_TOUCH_MS: 100,
  YJS_CLEANUP_DELAY_MS: 500,
}));
vi.mock('../../data/permissions', () => ({ authorizeDoc: vi.fn(async (_userId: string, requested: DocScope) => ({ scope: requested })) }));
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
const paragraph = (text: string) =>
  JSON.stringify([
    {
      id: 'b1',
      type: 'paragraph',
      props: { backgroundColor: 'default', textColor: 'default', textAlignment: 'left' },
      content: [{ type: 'text', text, styles: {} }],
      children: [],
    },
  ]);
const seedDescription = paragraph(' could you have a look?');
/** The stored description the relay seeds from; a test rewrites it as an outside write would. */
let description = seedDescription;
vi.mock('../../data/entity-content', () => ({ lockEntityDescription: vi.fn(async () => ({ description })) }));

const { runCompaction } = await import('../../sync/relay');
const { getCollab } = await import('../../sync/session-manager');
const { loadDocument } = await import('../../data/storage');
const { descriptionToSeed, stateToBlocksJson } = await import('#/modules/yjs/helpers/description-update');

/** The document's base state, and the log rows not folded into it. */
const baseOf = async (doc: DocScope) => (await loadDocument(doc))!.base;
const readLog = async (doc: DocScope) => (await loadDocument(doc))?.rows ?? [];

const tenantId = 'yjs-e2e-tenant';
const organizationId = '00000000-0000-4000-a000-000000000031';
const userId = '00000000-0000-4000-a000-0000000000e2';
const entityType = appConfig.productEntityTypes[0];
const ids = {
  burst: '40000000-0000-4000-a000-000000000001',
  pull: '40000000-0000-4000-a000-000000000002',
  idle: '40000000-0000-4000-a000-000000000003',
  orphan: '40000000-0000-4000-a000-000000000004',
  survivor: '40000000-0000-4000-a000-000000000005',
  outside: '40000000-0000-4000-a000-000000000006',
  late: '40000000-0000-4000-a000-000000000007',
};

function ctx(entityId: string): DocScope {
  return { entityType, entityId, tenantId, organizationId };
}

/** Text of block 0 in a stored state. */
function textOf(state: Uint8Array): string {
  const blocks = JSON.parse(stateToBlocksJson(state)) as { content: { type: string; text?: string }[] }[];
  return blocks[0].content.map((c) => c.text ?? '').join('');
}

let admin: pg.Client;
const relay = await startRelayServer();

beforeAll(async () => {
  admin = new pg.Client({ connectionString: testDatabaseUrl });
  await admin.connect();
  await seedOrg(admin, tenantId, organizationId, 'yjs-e2e-org');
});

afterAll(async () => {
  await relay.close(Object.values(ids).map(ctx));
  await cleanupSeed(admin, { tenantIds: [tenantId] });
  await admin.end();
});

/**
 * A synced y-websocket client on the document, handling the relay's generation frame as the app's client does: it
 * records every announced generation and its close codes, and drops the connection on a document of another
 * generation, so nothing of it is merged or uploaded.
 */
async function connectClient(entityId: string, doc = new Y.Doc()) {
  const token = createSignedToken({ userId, entityType, entityId, tenantId, organizationId });
  const provider = new WebsocketProvider(relay.baseUrl, entityId, doc, {
    params: { token, entityType, tenantId },
    WebSocketPolyfill: WsWebSocket as never,
    disableBc: true,
  });
  const generations: string[] = [];
  const closes: number[] = [];
  provider.messageHandlers[4] = (_encoder, decoder) => {
    const generation = decoding.readVarString(decoder);
    generations.push(generation);
    if (generations[0] !== generation) provider.destroy();
  };
  provider.on('connection-close', (event) => {
    if (event) closes.push(event.code);
  });
  await synced(provider);
  return { doc, provider, generations, closes };
}

/** Resolves at the provider's next completed handshake. */
function synced(provider: WebsocketProvider) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('sync timeout')), 5000);
    provider.once('sync', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
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
  const base = descriptionToSeed(seedDescription);
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

const sessionRows = async (entityId: string) => (await admin.query('SELECT 1 FROM yjs_documents WHERE entity_id = $1', [entityId])).rowCount;

/** The top-level children of the editor's fragment: one block group for one document, two when two histories were merged. */
const blockGroups = (doc: Y.Doc) => doc.getXmlFragment('document-store').length;

// No log listener runs here: an outside write reaches a session at its live stamp (outside-write.test.ts listens).
describe('relay end to end', () => {
  it('a burst of keystrokes right after sync all persist and materialize (the lost-first-update regression)', async () => {
    const { doc, provider } = await connectClient(ids.burst);
    const text = firstText(doc);
    expect(text.toString()).toBe(' could you have a look?');

    // Three separate transactions dispatched back to back: three frames in one burst. Keystrokes that beat the client's
    // reply to the relay's Step1 reach the log inside that reply, so the wait is on the stored text, not a row count.
    for (const ch of ['c', 'b', 'a']) doc.transact(() => text.insert(0, ch));
    await until(async () => textOf((await storedState(ctx(ids.burst)))!) === 'abc could you have a look?');
    provider.destroy();
    doc.destroy();

    const collab = getCollab(ctx(ids.burst))!;
    expect(await runCompaction(collab)).toBe('ok');

    expect(textOf(await baseOf(ctx(ids.burst)))).toBe('abc could you have a look?');
    expect(await readLog(ctx(ids.burst))).toEqual([]);
    expect(materialized.at(-1)?.editedBy).toBe(userId);
    expect(materialized.at(-1)?.description).toContain('abc could you have a look?');
  });

  it("must not write an idle live session's log via the startup sweep of another relay generation", async () => {
    const { doc, provider } = await connectClient(ids.idle);
    const text = firstText(doc);
    text.insert(text.length, '!');
    await until(async () => (await readLog(ctx(ids.idle))).length >= 1);
    // A day passes with nothing more logged, so the row and its log look stale; the live session stamps its row meanwhile.
    await admin.query("UPDATE yjs_documents SET updated_at = now() - interval '1 day' WHERE entity_id = $1", [ids.idle]);
    await admin.query("UPDATE yjs_updates SET created_at = now() - interval '1 day' WHERE entity_id = $1", [ids.idle]);
    await seedOrphan(ids.orphan, 'orphaned');
    await sleep(1000);

    const next = await startNextGeneration();
    try {
      await next.runStartupSweep();
    } finally {
      await next.closeDb();
    }

    // The live session keeps its log, and writes it over the whole document at its own compaction.
    expect(await sessionRows(ids.idle)).toBe(1);
    expect(await readLog(ctx(ids.idle))).toHaveLength(1);
    expect(await runCompaction(getCollab(ctx(ids.idle))!)).toBe('ok');
    expect(textOf(await baseOf(ctx(ids.idle)))).toBe(' could you have a look?!');
    const written = materialized.filter((entry) => entry.entityId === ids.idle).at(-1);
    expect(written?.description).toContain(' could you have a look?!');
    provider.destroy();
    doc.destroy();

    // Positive control: the orphan next to it, which no relay holds, is written; its log goes and its row stays.
    expect(materialized.find((entry) => entry.entityId === ids.orphan)?.description).toContain('orphaned could you have a look?');
    expect(await readLog(ctx(ids.orphan))).toEqual([]);
    expect(await sessionRows(ids.orphan)).toBe(1);
  });

  it("must not hide a surviving client document's edits after cleanup: it reconnects into the same history", async () => {
    const { doc, provider } = await connectClient(ids.survivor);
    const text = firstText(doc);
    text.insert(text.length, ' typed');
    await until(async () => (await readLog(ctx(ids.survivor))).length >= 1);

    // The socket closes (token expiry, a relay restart, going offline) while the editor stays open; the session's
    // cleanup writes the log and ends, and the document row stays.
    provider.disconnect();
    await until(async () => getCollab(ctx(ids.survivor)) === undefined);
    expect(await sessionRows(ids.survivor)).toBe(1);
    expect(materialized.filter((entry) => entry.entityId === ids.survivor).at(-1)?.description).toContain(' could you have a look? typed');

    text.insert(text.length, ' offline');
    provider.connect();
    await synced(provider);

    // One history: the editor shows the whole document, both edits included, and the offline one is written.
    expect(blockGroups(doc)).toBe(1);
    expect(textOf(Y.encodeStateAsUpdate(doc))).toBe(' could you have a look? typed offline');
    await until(async () => (await readLog(ctx(ids.survivor))).length >= 1);
    expect(await runCompaction(getCollab(ctx(ids.survivor))!)).toBe('ok');
    expect(materialized.filter((entry) => entry.entityId === ids.survivor).at(-1)?.description).toContain(' could you have a look? typed offline');
    provider.destroy();
    doc.destroy();
  });

  it('an outside write logged without a notification reaches a live client at the live stamp, in the same session and generation', async () => {
    const { doc, provider, generations, closes } = await connectClient(ids.outside);
    const text = firstText(doc);
    // Read before the client's edit is logged, as a write whose handler runs while someone types.
    const read = (await loadDocument(ctx(ids.outside)))!;
    text.insert(text.length, ' again');
    await until(async () => (await readLog(ctx(ids.outside))).length >= 1);

    // The write keeps the block and changes its start: the edit typed at its end concurrently survives.
    const appended = await appendOutsideWrite(ctx(ids.outside), outsideUpdate(read, paragraph('So, could you have a look?')), read.generation, false);
    expect(appended.status).toBe('appended');

    await until(() => text.toString() === 'So, could you have a look? again');
    expect(closes).toEqual([]);
    expect(generations).toHaveLength(1);
    expect(blockGroups(doc)).toBe(1);
    expect(provider.wsconnected).toBe(true);

    // The window is mixed: posted, credited to the client, and the stored document holds both.
    expect(await runCompaction(getCollab(ctx(ids.outside))!)).toBe('ok');
    expect(textOf(await baseOf(ctx(ids.outside)))).toBe('So, could you have a look? again');
    expect(materialized.filter((entry) => entry.entityId === ids.outside).at(-1)?.editedBy).toBe(userId);
    provider.destroy();
    doc.destroy();
  });

  it('must not log an update sent on a deleted document before its session ends: a restore reseeds without it', async () => {
    const { doc, provider, closes } = await connectClient(ids.late);

    // Retired as the backend's deletion does, here without its notification, and typed into at once, before the live
    // stamp notices. Access stays granted, as after a restore.
    description = paragraph('restored elsewhere');
    await admin.query('DELETE FROM yjs_documents WHERE entity_id = $1', [ids.late]);
    await admin.query('DELETE FROM yjs_updates WHERE entity_id = $1', [ids.late]);
    firstText(doc).insert(0, 'late ');

    await until(async () => closes.includes(1013));
    provider.destroy();
    doc.destroy();
    expect(await readLog(ctx(ids.late))).toEqual([]);

    // The reseed holds the restored description alone, in one history.
    const fresh = await connectClient(ids.late);
    expect(blockGroups(fresh.doc)).toBe(1);
    expect(textOf(Y.encodeStateAsUpdate(fresh.doc))).toBe('restored elsewhere');
    expect(await readLog(ctx(ids.late))).toEqual([]);
    fresh.provider.destroy();
    fresh.doc.destroy();
    description = seedDescription;
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
    const merged = Y.mergeUpdates([await baseOf(ctx(ids.pull)), ...rows.map((row) => row.payload)]);
    const verify = new Y.Doc();
    Y.applyUpdate(verify, merged);
    expect(verify.getXmlFragment('document-store').toString()).toContain('offline paragraph');
    expect(verify.getXmlFragment('document-store').toString()).toContain('could you have a look?');
    provider.destroy();
    doc.destroy();
  });
});
