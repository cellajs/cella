import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { appConfig } from 'shared';
import { testDatabaseUrl } from 'shared/test-db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { decodeLogNotice, type LogNotice, YJS_LOG_CHANNEL } from '#/modules/yjs/helpers/yjs-log';
import type { DocScope } from '../../constants';
import { mapUpdate, until } from '../helpers';
import { cleanupSeed, insertDocument, seedOrg } from './seed';

// A delay long enough that a test reads the channel between an append's commit and its batch.
const { DELAY_MS } = vi.hoisted(() => ({ DELAY_MS: 400 }));
vi.mock('../../constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../constants')>()),
  YJS_LOG_NOTICE_DELAY_MS: DELAY_MS,
}));

const { appendUpdate, loadDocument } = await import('../../data/storage');

const tenantId = 'yjs-notices-tenant';
const organizationId = '00000000-0000-4000-a000-0000000000c1';
const userId = '00000000-0000-4000-a000-0000000000c2';

const scopeOf = (): DocScope => ({ entityType: appConfig.productEntityTypes[0], entityId: randomUUID(), tenantId, organizationId });

let admin: pg.Client;
let listener: pg.Client;
/** Every payload heard on the log channel, in delivery order, which is commit order. */
const heard: string[] = [];

/** The notices heard for one document. */
const heardFor = ({ entityId }: DocScope) =>
  heard.map(decodeLogNotice).filter((notice): notice is LogNotice => notice !== null && notice.entityId === entityId);

/** Returns once a notification sent now is heard: notifications arrive in commit order, so every earlier one has too. */
async function barrier(): Promise<void> {
  const token = `barrier-${randomUUID()}`;
  await admin.query('SELECT pg_notify($1, $2)', [YJS_LOG_CHANNEL, token]);
  await until(() => heard.includes(token), 5000);
}

async function appended(scope: DocScope, generation: string, key: string): Promise<number> {
  const result = await appendUpdate(scope, userId, mapUpdate(key, 1), generation);
  if (result.status !== 'appended') throw new Error(`append ${result.status}`);
  return result.id;
}

beforeAll(async () => {
  admin = new pg.Client({ connectionString: testDatabaseUrl });
  await admin.connect();
  await cleanupSeed(admin, { tenantIds: [tenantId] });
  await seedOrg(admin, tenantId, organizationId, 'yjs-notices');
  listener = new pg.Client({ connectionString: testDatabaseUrl });
  await listener.connect();
  listener.on('notification', ({ channel, payload }) => {
    if (channel === YJS_LOG_CHANNEL && payload) heard.push(payload);
  });
  await listener.query(`LISTEN ${YJS_LOG_CHANNEL}`);
});

afterAll(async () => {
  await listener.end();
  await cleanupSeed(admin, { tenantIds: [tenantId] });
  await admin.end();
});

describe("a relay's appends announce themselves after commit, batched", () => {
  it('notifies nothing in the append transaction, then one notice per document with every row of the batch', async () => {
    const one = scopeOf();
    const two = scopeOf();
    const oneGeneration = await insertDocument(admin, one, mapUpdate('seed', true));
    const twoGeneration = await insertDocument(admin, two, mapUpdate('seed', true));

    const first = await appended(one, oneGeneration, 'a');
    const second = await appended(two, twoGeneration, 'b');
    const third = await appended(one, oneGeneration, 'c');
    // Committed, and nothing heard: a notice in the append transaction would have arrived before the barrier.
    await barrier();
    expect(heardFor(one)).toEqual([]);
    expect(heardFor(two)).toEqual([]);

    await until(() => heardFor(one).length > 0 && heardFor(two).length > 0, DELAY_MS * 5);
    await barrier();
    expect(heardFor(one)).toEqual([{ tenantId, entityType: one.entityType, entityId: one.entityId, logIds: [first, third] }]);
    expect(heardFor(two)).toEqual([{ tenantId, entityType: two.entityType, entityId: two.entityId, logIds: [second] }]);
  });

  it('announces nothing for an append that rolled back', async () => {
    const scope = scopeOf();
    const generation = await insertDocument(admin, scope, mapUpdate('seed', true));
    let logged: number | undefined;

    await expect(
      appendUpdate(scope, userId, mapUpdate('lost', 1), generation, (id) => {
        logged = id;
        throw new Error('the transaction fails after the insert');
      }),
    ).rejects.toThrow('the transaction fails after the insert');

    expect(logged).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS * 2));
    await barrier();
    expect(heardFor(scope)).toEqual([]);
    expect((await loadDocument(scope))!.rows).toEqual([]);
  });
});
