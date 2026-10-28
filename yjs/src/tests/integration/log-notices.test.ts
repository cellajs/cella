import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { appConfig } from 'shared';
import { testDatabaseUrl } from 'shared/test-db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { decodeLogNotice, type LogNotice, type YjsDocScope, yjsLogChannel } from '#/modules/yjs/helpers/yjs-log';
import { mapUpdate, until } from '../helpers';
import { cleanupSeed, insertDocument, seedOrg } from './seed';

// A delay long enough that a test reads the channel between an append's commit and its batch.
const { delayMs } = vi.hoisted(() => ({ delayMs: 400 }));
vi.mock('../../constants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../constants')>()),
  yjsLogNoticeDelayMs: delayMs,
}));

const { appendUpdate, findDocument } = await import('../../data/storage');

const tenantId = 'yjs-notices-tenant';
const organizationId = '00000000-0000-4000-a000-0000000000c1';
const userId = '00000000-0000-4000-a000-0000000000c2';

const scopeOf = (): YjsDocScope => ({ entityType: appConfig.productEntityTypes[0], entityId: randomUUID(), tenantId, organizationId });

let admin: pg.Client;
let listener: pg.Client;
/** Every payload heard on the log channel, in delivery order, which is commit order. */
const heard: string[] = [];

/** The notices heard for one document. */
const heardFor = ({ entityId }: YjsDocScope) =>
  heard.map(decodeLogNotice).filter((notice): notice is LogNotice => notice !== null && notice.entityId === entityId);

/** Returns once a notification sent now is heard: notifications arrive in commit order, so every earlier one has too. */
async function barrier(): Promise<void> {
  const token = `barrier-${randomUUID()}`;
  await admin.query('SELECT pg_notify($1, $2)', [yjsLogChannel, token]);
  await until(() => heard.includes(token), 5000);
}

async function appended(scope: YjsDocScope, generation: string, key: string): Promise<number> {
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
    if (channel === yjsLogChannel && payload) heard.push(payload);
  });
  await listener.query(`LISTEN ${yjsLogChannel}`);
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

    await until(() => heardFor(one).length > 0 && heardFor(two).length > 0, delayMs * 5);
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
    await new Promise((resolve) => setTimeout(resolve, delayMs * 2));
    await barrier();
    expect(heardFor(scope)).toEqual([]);
    expect((await findDocument(scope))!.rows).toEqual([]);
  });
});
