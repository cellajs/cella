import { type ChildProcess, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { sql } from 'drizzle-orm';
import * as decoding from 'lib0/decoding';
import pg from 'pg';
import { hierarchy } from 'shared';
import { testDatabaseUrl, testRuntimeDatabaseUrl } from 'shared/test-db';
import { buildTestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { testYjsTokenPublicKey } from 'shared/testing/yjs-token-keys';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocket as WsWebSocket } from 'ws';
import { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import type { DocScope } from '../../constants';
import { createSignedToken, deferred, startRelayServer, until } from '../helpers';
import { cleanupSeed, paragraphs, recordOutsideWrite, seedAttachment, seedEntityHierarchy, seedMembership, seedOrg, seedUser } from './seed';

// The relay end to end over the real database (runtime_role) as the backend writes to it: real authorization of entity
// rows, the seed transaction and the log listener, with outside writes and deletions made as the backend makes them.
// Only the materialize POST and the connection limiter are stubbed.
vi.mock('../../server/rate-limiter', () => ({ checkConnectionRate: vi.fn(async () => true) }));
vi.mock('../../sync/materialize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../sync/materialize')>()),
  postMaterialize: vi.fn(async () => 'ok'),
}));
/** When set, a seed transaction waits here after its FOR SHARE read of the entity row, holding the lock. */
let seedHold: { reached: () => void; release: Promise<void> } | null = null;
vi.mock('../../data/entity-content', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/entity-content')>();
  return {
    lockEntityDescription: async (...args: Parameters<typeof actual.lockEntityDescription>) => {
      const read = await actual.lockEntityDescription(...args);
      if (seedHold) {
        seedHold.reached();
        await seedHold.release;
      }
      return read;
    },
  };
});

const { onLogNotice, relayUnseenEverywhere } = await import('../../sync/relay');
const { getCollab } = await import('../../sync/session-manager');
const { logListenerStatus, startLogListener, stopLogListener } = await import('../../data/listener');
const { listenerApplicationName, withRlsTx } = await import('../../data/db');
const { loadDocument } = await import('../../data/storage');
const { stateToBlocksJson } = await import('#/modules/yjs/helpers/description-update');
const { retireYjsDocuments } = await import('#/modules/yjs/operations/retire-yjs-documents');

const tenantId = 'yjs-outside-tenant';
const organizationId = '60000000-0000-4000-a000-000000000001';
const userId = randomUUID();
const plan = buildTestEntityHierarchyPlan({ entityType: 'attachment', organizationId, makeChannelId: () => randomUUID() });
const entityIds: string[] = [];

let admin: pg.Client;
const relay = await startRelayServer();
/** LISTENs so far. The live stamp runs at its real minute: what reaches a client within a test came through the channel. */
let listens = 0;

beforeAll(async () => {
  admin = new pg.Client({ connectionString: testDatabaseUrl });
  await admin.connect();
  await seedUser(admin, userId, 'outside');
  await seedOrg(admin, tenantId, organizationId, 'yjs-outside');
  await seedEntityHierarchy(admin, plan, tenantId, userId, 'yjs-outside');
  await seedMembership(admin, tenantId, organizationId, userId, hierarchy.getMostPrivilegedRole('organization'));
  startLogListener(onLogNotice, () => {
    listens++;
    relayUnseenEverywhere();
  });
  await until(() => logListenerStatus() === 'listening');
});

afterAll(async () => {
  await stopLogListener();
  await relay.close(entityIds.map((entityId) => scopeOf(entityId)));
  await cleanupSeed(admin, { tenantIds: [tenantId], userIds: [userId], plans: [plan] });
  await admin.end();
});

const scopeOf = (entityId: string): DocScope => ({ entityType: 'attachment', entityId, tenantId, organizationId });

/** An attachment of the user's, with `description` stored. */
async function attachment(description: string | null): Promise<DocScope> {
  const entityId = randomUUID();
  entityIds.push(entityId);
  await seedAttachment(admin, entityId, tenantId, plan, userId);
  await admin.query('UPDATE attachments SET description = $2 WHERE id = $1', [entityId, description]);
  return scopeOf(entityId);
}

/** A y-websocket client of the user on the document, recording every generation it is told and every close code. */
function openClient(baseUrl: string, scope: DocScope, doc = new Y.Doc()) {
  const token = createSignedToken({ userId, entityType: scope.entityType, entityId: scope.entityId, tenantId, organizationId });
  const provider = new WebsocketProvider(baseUrl, scope.entityId, doc, {
    params: { token, entityType: scope.entityType, tenantId },
    WebSocketPolyfill: WsWebSocket as never,
    disableBc: true,
  });
  const generations: string[] = [];
  const closes: number[] = [];
  provider.messageHandlers[4] = (_encoder, decoder) => void generations.push(decoding.readVarString(decoder));
  provider.on('connection-close', (event) => {
    if (event) closes.push(event.code);
  });
  const synced = new Promise<void>((resolve) => provider.once('sync', () => resolve()));
  return { doc, provider, generations, closes, synced };
}

async function connectClient(baseUrl: string, scope: DocScope) {
  const client = openClient(baseUrl, scope);
  await client.synced;
  return client;
}

/** The text of each block the client's editor would show. */
const textsOf = (doc: Y.Doc) =>
  (JSON.parse(stateToBlocksJson(Y.encodeStateAsUpdate(doc))) as { content: { text?: string }[] }[]).map((block) =>
    block.content.map((part) => part.text ?? '').join(''),
  );

/** The top-level children of the editor's fragment: one block group for one document. */
const blockGroups = (doc: Y.Doc) => doc.getXmlFragment('document-store').length;

/** The XML element of the document's first paragraph. */
function firstParagraph(doc: Y.Doc): Y.XmlElement {
  const find = (node: Y.XmlFragment | Y.XmlElement): Y.XmlElement | null => {
    for (const child of node.toArray()) {
      if (!(child instanceof Y.XmlElement)) continue;
      if (child.nodeName === 'paragraph') return child;
      const found = find(child);
      if (found) return found;
    }
    return null;
  };
  const paragraph = find(doc.getXmlFragment('document-store'));
  if (!paragraph) throw new Error('no paragraph');
  return paragraph;
}

/** Whether `promise` is still pending after `ms`: it waits for a lock. */
const stillPending = async (promise: Promise<unknown>, ms = 300) =>
  (await Promise.race([promise.then(() => false), sleep(ms).then(() => true)])) === true;

describe('outside writes reach live sessions', () => {
  it('relays an outside write to a live client at once, without a reconnect, in the same generation', async () => {
    const scope = await attachment(paragraphs('first', 'second'));
    const client = await connectClient(relay.baseUrl, scope);

    const appended = await recordOutsideWrite(scope, paragraphs('first, rewritten', 'second'), { updateEntity: true });
    expect(appended?.status).toBe('appended');

    await until(() => textsOf(client.doc).join('|') === 'first, rewritten|second', 2000);
    expect(client.closes).toEqual([]);
    expect(client.generations).toHaveLength(1);
    expect(blockGroups(client.doc)).toBe(1);
    // The stored row is server-origin: no editor is credited for it.
    expect((await loadDocument(scope))!.rows.map((row) => row.userId)).toEqual([null]);
    client.provider.destroy();
  });

  it('catches up what was notified while the listener was down, once it reconnects', async () => {
    const scope = await attachment(paragraphs('before'));
    const client = await connectClient(relay.baseUrl, scope);
    const before = listens;

    const { rowCount } = await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = $1', [
      listenerApplicationName,
    ]);
    expect(rowCount).toBe(1);
    await until(() => logListenerStatus() === 'connecting');
    // Notified while no connection listens: this notification is never delivered.
    await recordOutsideWrite(scope, paragraphs('while down'), { updateEntity: true });

    await until(() => logListenerStatus() === 'listening', 5000);
    expect(listens).toBe(before + 1);
    await until(() => textsOf(client.doc)[0] === 'while down', 2000);
    expect(client.closes).toEqual([]);
    client.provider.destroy();
  });
});

describe('the seed transaction', () => {
  it('must not lose a write committing as the first client connects: the seed waits for it and reads it', async () => {
    const scope = await attachment(paragraphs('old'));
    // The outside write holds the entity row; with no document row yet, it appends nothing.
    await admin.query('BEGIN');
    await admin.query('UPDATE attachments SET description = $2 WHERE id = $1', [scope.entityId, paragraphs('written')]);
    const client = openClient(relay.baseUrl, scope);
    try {
      expect(await stillPending(client.synced)).toBe(true);
    } finally {
      await admin.query('COMMIT');
    }

    await client.synced;
    expect(textsOf(client.doc)).toEqual(['written']);
    client.provider.destroy();
  });

  it('must not lose a write that waits for a seed: it finds the document row the seed made and appends into it', async () => {
    const scope = await attachment(paragraphs('old'));
    const reached = deferred();
    const release = deferred();
    seedHold = { reached: reached.release, release: release.promise };
    const client = openClient(relay.baseUrl, scope);
    let write: Promise<unknown> | undefined;
    try {
      await reached.promise;
      seedHold = null;
      // The seed holds the entity row FOR SHARE: the write's UPDATE waits for the seed's commit.
      write = recordOutsideWrite(scope, paragraphs('written'), { updateEntity: true });
      expect(await stillPending(write)).toBe(true);
    } finally {
      seedHold = null;
      release.release();
    }

    expect(await write).toMatchObject({ status: 'appended' });
    await client.synced;
    await until(() => textsOf(client.doc)[0] === 'written', 2000);
    expect(blockGroups(client.doc)).toBe(1);
    client.provider.destroy();
  });

  it('seeds a document with no description as one empty paragraph: two first clients and an outside write keep one block group', async () => {
    const scope = await attachment(null);
    const [one, two] = await Promise.all([connectClient(relay.baseUrl, scope), connectClient(relay.baseUrl, scope)]);
    expect(blockGroups(one.doc)).toBe(1);
    expect(textsOf(one.doc)).toEqual(['']);

    // Both type into the paragraph at once, as two first writers would.
    firstParagraph(one.doc).insert(0, [new Y.XmlText('one ')]);
    firstParagraph(two.doc).insert(0, [new Y.XmlText('two ')]);
    await until(async () => (await loadDocument(scope))!.rows.length >= 2, 2000);
    await recordOutsideWrite(scope, paragraphs('written'), { updateEntity: true });

    for (const client of [one, two]) {
      await until(() => textsOf(client.doc).join('|') === 'written', 2000);
      expect(blockGroups(client.doc)).toBe(1);
      client.provider.destroy();
    }
  });
});

describe('a deleted entity', () => {
  it('ends the session at once with 1013, and the reconnect is closed with 4410', async () => {
    const scope = await attachment(paragraphs('doomed'));
    const client = await connectClient(relay.baseUrl, scope);

    // The delete op: a soft delete, in a transaction that may see deleted rows, and the `.deleted` handler's
    // retirement, which notifies `retired`.
    await withRlsTx(
      tenantId,
      userId,
      async (tx) => {
        await tx.execute(sql`UPDATE attachments SET deleted_at = now(), deleted_by = ${userId} WHERE id = ${scope.entityId}`);
        await retireYjsDocuments({ var: { db: tx } }, { entityType: 'attachment', entityIds: [scope.entityId] });
      },
      { includeDeleted: true },
    );

    await until(() => client.closes.includes(4410), 3000);
    client.provider.destroy();
    expect(client.closes[0]).toBe(1013);
    expect(getCollab(scope)).toBeUndefined();
    // Nothing seeds a document for it again.
    expect(await loadDocument(scope)).toBeNull();
  });
});

describe('two relays on one database', () => {
  let child: ChildProcess | undefined;

  afterAll(() => {
    child?.kill();
  });

  /** A second relay in its own process, as a start-first rollout runs one: its own sessions, pool and listener. */
  async function startSecondRelay(): Promise<string> {
    const code = `
      import { createServer } from 'node:http';
      import { WebSocketServer } from 'ws';
      const { setupConnectionHandler, setupUpgradeHandler } = await import('./src/server/upgrade.ts');
      const { startLogListener } = await import('./src/data/listener.ts');
      const { onLogNotice, relayUnseenEverywhere } = await import('./src/sync/relay.ts');
      const server = createServer((_req, res) => res.writeHead(404).end());
      const wss = new WebSocketServer({ noServer: true });
      server.on('upgrade', setupUpgradeHandler(wss));
      setupConnectionHandler(wss);
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      startLogListener(onLogNotice, () => {
        relayUnseenEverywhere();
        process.send({ port: server.address().port });
      });
      process.on('disconnect', () => process.exit(0));
    `;
    child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
      cwd: new URL('../../..', import.meta.url).pathname,
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: testRuntimeDatabaseUrl,
        YJS_TOKEN_PUBLIC_KEY: testYjsTokenPublicKey,
        YJS_RELAY_SECRET: 'test-yjs-relay-secret-for-unit-tests',
        // Its compactions find no backend and keep the log: a retry.
        BACKEND_INTERNAL_URL: 'http://127.0.0.1:9',
        // An in-memory connection limiter.
        NODB: 'true',
        PINO_LOG_LEVEL: 'silent',
      },
    });
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    const port = await new Promise<number>((resolve, reject) => {
      child?.once('message', (message: { port: number }) => resolve(message.port));
      child?.once('exit', (code) => reject(new Error(`Second relay exited with ${code}: ${stderr}`)));
    });
    return `ws://127.0.0.1:${port}`;
  }

  it('relays an outside write to the clients of both, and each relays the other one’s appends', { timeout: 60_000 }, async () => {
    const secondUrl = await startSecondRelay();
    const scope = await attachment(paragraphs('shared'));
    const here = await connectClient(relay.baseUrl, scope);
    const there = await connectClient(secondUrl, scope);
    // One seed, converged on by both relays.
    expect(there.generations).toEqual(here.generations);

    await recordOutsideWrite(scope, paragraphs('written once'), { updateEntity: true });
    for (const client of [here, there]) await until(() => textsOf(client.doc)[0] === 'written once', 3000);

    // A client's update, logged by its relay and announced once it committed, in a batch, reaches the other relay's
    // client through the same channel, both ways: each relay process announces its own appends.
    firstParagraph(here.doc).insert(0, [new Y.XmlText('typed ')]);
    await until(() => textsOf(there.doc)[0] === 'typed written once', 3000);
    firstParagraph(there.doc).insert(0, [new Y.XmlText('back ')]);
    await until(() => textsOf(here.doc)[0] === 'back typed written once', 3000);
    expect(here.closes).toEqual([]);
    expect(there.closes).toEqual([]);
    for (const client of [here, there]) client.provider.destroy();
  });
});
