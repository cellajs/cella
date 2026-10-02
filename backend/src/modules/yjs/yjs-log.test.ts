import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { testDatabaseUrl } from 'shared/test-db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { baseDb, type Tx } from '#/db/db';
import { tenantIdLength } from '#/db/utils/constraints';
import { organizationsTable } from '#/modules/organization/organization-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { yjsDocumentsTable, yjsUpdatesTable } from '#/modules/yjs/yjs-db';
import {
  appendYjsUpdate,
  decodeLogNotice,
  encodeLogNotice,
  type LogNotice,
  readYjsDocument,
  retireYjsDocuments,
  YJS_LOG_CHANNEL,
  YJS_MAX_UPDATE_BYTES,
  type YjsDocScope,
} from '#/modules/yjs/yjs-log';
import { adminDb, createTestOrganization } from '../../../tests/helpers';

describe('log notices', () => {
  const key = { tenantId: 'tenant-1', entityType: 'attachment', entityId: randomUUID() };

  it('round-trip an appended row and a retirement, as keys only', () => {
    const notices: LogNotice[] = [
      { ...key, logId: 42 },
      { ...key, retired: true },
    ];
    for (const notice of notices) expect(decodeLogNotice(encodeLogNotice(notice))).toEqual(notice);
    expect(JSON.parse(encodeLogNotice({ ...key, logId: 42 }))).toEqual({ t: key.tenantId, e: key.entityType, i: key.entityId, id: 42 });
    expect(JSON.parse(encodeLogNotice({ ...key, retired: true }))).toEqual({ t: key.tenantId, e: key.entityType, i: key.entityId, retired: true });
  });

  it('stays far below the 8,000-byte limit on a notification, at the longest keys', () => {
    const longest = { tenantId: 'x'.repeat(tenantIdLength), entityType: 'x'.repeat(50), entityId: randomUUID(), logId: Number.MAX_SAFE_INTEGER };
    expect(Buffer.byteLength(encodeLogNotice(longest))).toBeLessThan(250);
  });

  it('must not throw on a payload it did not write: anything else decodes to null', () => {
    const { tenantId: t, entityType: e, entityId: i } = key;
    const payloads = [
      '',
      'not json',
      'null',
      '42',
      '"text"',
      '[]',
      '{}',
      JSON.stringify({ e, i, id: 1 }),
      JSON.stringify({ t: '', e, i, id: 1 }),
      JSON.stringify({ t: 7, e, i, id: 1 }),
      JSON.stringify({ t, e, i }),
      JSON.stringify({ t, e, i, id: 0 }),
      JSON.stringify({ t, e, i, id: -1 }),
      JSON.stringify({ t, e, i, id: 1.5 }),
      JSON.stringify({ t, e, i, id: '1' }),
      JSON.stringify({ t, e, i, id: 2 ** 53 }),
      JSON.stringify({ t, e, i, retired: 'true' }),
    ];
    for (const payload of payloads) expect(decodeLogNotice(payload), payload).toBeNull();
  });
});

/**
 * The one way into the log, on the worker's database. Transactions run as the relay's do: under the document's tenant
 * with no user, so the suite holds under runtime_role too. Rows are arranged and read on the admin connection.
 */
describe('the Yjs log', () => {
  const entityType = 'attachment' as const;
  let tenantId: string;
  let organizationId: string;
  let listener: pg.Client;
  const heard: string[] = [];

  beforeAll(async () => {
    const organization = await createTestOrganization();
    tenantId = organization.tenantId;
    organizationId = organization.id;
    listener = new pg.Client({ connectionString: testDatabaseUrl });
    await listener.connect();
    listener.on('notification', ({ channel, payload }) => {
      if (channel === YJS_LOG_CHANNEL) heard.push(payload ?? '');
    });
    await listener.query(`LISTEN ${YJS_LOG_CHANNEL}`);
  });

  afterAll(async () => {
    await listener.end();
    await adminDb.delete(yjsUpdatesTable).where(eq(yjsUpdatesTable.tenantId, tenantId));
    await adminDb.delete(yjsDocumentsTable).where(eq(yjsDocumentsTable.tenantId, tenantId));
    await adminDb.delete(organizationsTable).where(eq(organizationsTable.id, organizationId));
    await adminDb.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
  });

  const scopeOf = (): YjsDocScope => ({ entityType, entityId: randomUUID(), tenantId, organizationId });

  /** A transaction under the document's tenant with no user, as the relay's storage opens one. */
  const asSystem = <T>(fn: (tx: Tx) => Promise<T>) =>
    baseDb.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true), set_config('app.user_id', '', true)`);
      return fn(tx);
    });

  /** A transaction that runs `fn` and then stays open, holding its locks, until released. */
  const holdOpen = <T>(fn: (tx: Tx) => Promise<T>) => {
    const ran = Promise.withResolvers<T>();
    const released = Promise.withResolvers<void>();
    const done = asSystem(async (tx) => {
      const value = await fn(tx);
      ran.resolve(value);
      await released.promise;
      return value;
    });
    return { ran: Promise.race([ran.promise, done]), release: () => released.resolve(), done };
  };

  /** A transaction that records its backend pid, then runs `fn`: the pid shows when it waits for a lock. */
  const tracked = <T>(fn: (tx: Tx) => Promise<T>) => {
    let pid: number | undefined;
    const done = asSystem(async (tx) => {
      const { rows } = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
      pid = rows[0].pid;
      return fn(tx);
    });
    const waitsForLock = () =>
      vi.waitUntil(
        async () => {
          if (pid === undefined) return false;
          const { rows } = await adminDb.execute<{ waiting: boolean }>(
            sql`SELECT wait_event_type = 'Lock' AS waiting FROM pg_stat_activity WHERE pid = ${pid} AND datname = current_database()`,
          );
          return rows[0]?.waiting === true;
        },
        { timeout: 5000, interval: 10 },
      );
    return { done, waitsForLock };
  };

  /** Seeds the document row as the relay does; returns its generation. */
  const seed = async (scope: YjsDocScope, state: Uint8Array = new Uint8Array()) => {
    const [row] = await adminDb
      .insert(yjsDocumentsTable)
      .values({ ...scope, state: Buffer.from(state) })
      .returning({ generation: yjsDocumentsTable.generation });
    return row.generation;
  };

  const textUpdate = (text: string) => {
    const doc = new Y.Doc();
    doc.getText('t').insert(0, text);
    return Y.encodeStateAsUpdate(doc);
  };

  const rowsOf = async ({ entityId }: YjsDocScope) => ({
    docs: (await adminDb.select().from(yjsDocumentsTable).where(eq(yjsDocumentsTable.entityId, entityId))).length,
    log: (await adminDb.select().from(yjsUpdatesTable).where(eq(yjsUpdatesTable.entityId, entityId))).length,
  });

  /** The notices heard for one document. */
  const heardFor = ({ entityId }: YjsDocScope) => heard.map(decodeLogNotice).filter((notice) => notice?.entityId === entityId);

  /** Returns once a notification sent now is heard: notifications arrive in commit order, so every earlier one has too. */
  const barrier = async () => {
    const token = `barrier-${randomUUID()}`;
    await adminDb.execute(sql`SELECT pg_notify(${YJS_LOG_CHANNEL}, ${token})`);
    await vi.waitUntil(() => heard.includes(token), { timeout: 5000, interval: 10 });
  };

  it('appends updates and reads them back under the base, oldest first, with their senders', async () => {
    const scope = scopeOf();
    const base = textUpdate('base');
    const generation = await seed(scope, base);
    const userId = randomUUID();
    const [a, b] = [textUpdate('a'), textUpdate('b')];

    const first = await asSystem((tx) => appendYjsUpdate(tx, scope, a, { userId, generation }));
    const second = await asSystem((tx) => appendYjsUpdate(tx, scope, b, { userId: null, generation }));
    if (first.status !== 'appended' || second.status !== 'appended') throw new Error('both appends must land');
    expect(second.id).toBeGreaterThan(first.id);

    expect(await asSystem((tx) => readYjsDocument(tx, scope))).toEqual({
      generation,
      base,
      rows: [
        { id: first.id, payload: a, userId },
        { id: second.id, payload: b, userId: null },
      ],
    });
  });

  it('reads null for a document with no row', async () => {
    expect(await asSystem((tx) => readYjsDocument(tx, scopeOf()))).toBeNull();
  });

  it('must not log an update that is too large, malformed or empty: answered before any query (16)', async () => {
    const untouchable = new Proxy({} as Tx, {
      get: () => {
        throw new Error('no query may run');
      },
    });
    const scope = scopeOf();
    const opts = { userId: null, generation: randomUUID() };
    expect(await appendYjsUpdate(untouchable, scope, new Uint8Array(YJS_MAX_UPDATE_BYTES + 1), opts)).toEqual({ status: 'too-large' });
    expect(await appendYjsUpdate(untouchable, scope, new Uint8Array([1, 2, 3]), opts)).toEqual({ status: 'malformed' });
    expect(await appendYjsUpdate(untouchable, scope, Y.encodeStateAsUpdate(new Y.Doc()), opts)).toEqual({ status: 'empty' });
  });

  it('must not log an update for a document with no row (16)', async () => {
    const scope = scopeOf();
    expect(await asSystem((tx) => appendYjsUpdate(tx, scope, textUpdate('a'), { userId: null, generation: randomUUID() }))).toEqual({
      status: 'no-document',
    });
    expect(await rowsOf(scope)).toEqual({ docs: 0, log: 0 });
  });

  it('must not log an update of another generation: it answers the current one (15)', async () => {
    const scope = scopeOf();
    const generation = await seed(scope);
    expect(await asSystem((tx) => appendYjsUpdate(tx, scope, textUpdate('a'), { userId: null, generation: randomUUID() }))).toEqual({
      status: 'stale-generation',
      generation,
    });
    expect(await rowsOf(scope)).toEqual({ docs: 1, log: 0 });
  });

  it('must not log or announce an append whose transaction rolls back', async () => {
    const scope = scopeOf();
    const generation = await seed(scope);
    await expect(
      asSystem(async (tx) => {
        await appendYjsUpdate(tx, scope, textUpdate('a'), { userId: null, generation });
        throw new Error('the write fails after the append');
      }),
    ).rejects.toThrow('the write fails after the append');
    await barrier();
    expect(heardFor(scope)).toEqual([]);
    expect(await rowsOf(scope)).toEqual({ docs: 1, log: 0 });
  });

  it('announces an append at commit, not before, and stays silent with notify off', async () => {
    const scope = scopeOf();
    const generation = await seed(scope);

    const held = holdOpen((tx) => appendYjsUpdate(tx, scope, textUpdate('a'), { userId: null, generation }));
    const appended = await held.ran;
    await barrier();
    expect(heardFor(scope)).toEqual([]);
    held.release();
    await held.done;
    await barrier();
    if (appended.status !== 'appended') throw new Error('the append must land');
    expect(heardFor(scope)).toEqual([{ tenantId, entityType, entityId: scope.entityId, logId: appended.id }]);

    const silent = await asSystem((tx) => appendYjsUpdate(tx, scope, textUpdate('b'), { userId: null, generation, notify: false }));
    await barrier();
    expect(silent.status).toBe('appended');
    expect(heardFor(scope)).toHaveLength(1);
    expect(await rowsOf(scope)).toEqual({ docs: 1, log: 2 });
  });

  it('retires documents, base and log, and announces each retired one', async () => {
    const [first, second, unseeded] = [scopeOf(), scopeOf(), scopeOf()];
    for (const scope of [first, second]) {
      const generation = await seed(scope);
      await asSystem((tx) => appendYjsUpdate(tx, scope, textUpdate('a'), { userId: null, generation, notify: false }));
    }

    await asSystem((tx) => retireYjsDocuments(tx, entityType, [first.entityId, second.entityId, unseeded.entityId]));
    await barrier();
    for (const scope of [first, second]) {
      expect(await rowsOf(scope)).toEqual({ docs: 0, log: 0 });
      expect(heardFor(scope)).toEqual([{ tenantId, entityType, entityId: scope.entityId, retired: true }]);
    }
    expect(heardFor(unseeded)).toEqual([]);
  });

  it('must not leave an append in flight behind a retirement: the retirement waits for it, then takes its row (17)', async () => {
    const scope = scopeOf();
    const generation = await seed(scope);

    const append = holdOpen((tx) => appendYjsUpdate(tx, scope, textUpdate('late'), { userId: null, generation }));
    expect((await append.ran).status).toBe('appended');
    const retire = tracked((tx) => retireYjsDocuments(tx, entityType, [scope.entityId]));
    await retire.waitsForLock();

    append.release();
    await append.done;
    await retire.done;
    expect(await rowsOf(scope)).toEqual({ docs: 0, log: 0 });
    expect(await asSystem((tx) => appendYjsUpdate(tx, scope, textUpdate('after'), { userId: null, generation }))).toEqual({
      status: 'no-document',
    });
  });

  it('reads base and log as one: a base replace waits for the read, an append does not, and a read waits for a compaction (D3)', async () => {
    const scope = scopeOf();
    const generation = await seed(scope, textUpdate('base'));

    const read = holdOpen((tx) => readYjsDocument(tx, scope));
    await read.ran;
    // An append holds the row FOR KEY SHARE, which the read's FOR SHARE lets through.
    const appended = await asSystem((tx) => appendYjsUpdate(tx, scope, textUpdate('more'), { userId: null, generation }));
    if (appended.status !== 'appended') throw new Error('the append must land');
    // A compaction replaces the base (an UPDATE of the row) and deletes the rows it folded, after the read ends.
    const folded = Y.mergeUpdates([textUpdate('base'), textUpdate('more')]);
    const compact = tracked(async (tx) => {
      await tx
        .update(yjsDocumentsTable)
        .set({ state: Buffer.from(folded) })
        .where(eq(yjsDocumentsTable.entityId, scope.entityId));
      await tx.delete(yjsUpdatesTable).where(eq(yjsUpdatesTable.id, appended.id));
    });
    await compact.waitsForLock();
    read.release();
    await read.done;
    await compact.done;

    // A compaction in flight: the read waits for it, then sees the new base and none of the rows folded into it.
    const refold = Y.mergeUpdates([folded, textUpdate('again')]);
    const again = await asSystem((tx) => appendYjsUpdate(tx, scope, textUpdate('again'), { userId: null, generation, notify: false }));
    if (again.status !== 'appended') throw new Error('the append must land');
    const compacting = holdOpen(async (tx) => {
      await tx
        .update(yjsDocumentsTable)
        .set({ state: Buffer.from(refold) })
        .where(eq(yjsDocumentsTable.entityId, scope.entityId));
      await tx.delete(yjsUpdatesTable).where(eq(yjsUpdatesTable.id, again.id));
    });
    await compacting.ran;
    const reread = tracked((tx) => readYjsDocument(tx, scope));
    await reread.waitsForLock();
    compacting.release();
    await compacting.done;
    expect(await reread.done).toEqual({ generation, base: refold, rows: [] });
  });
});
