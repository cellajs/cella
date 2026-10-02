import { randomUUID } from 'node:crypto';
import { asc, eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { deleteAttachments, updateAttachment } from 'sdk';
import { appConfig } from 'shared';
import { testDatabaseUrl } from 'shared/test-db';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { ActorContext } from '#/core/context';
import { generateServerHLC } from '#/core/stx';
import { baseDb } from '#/db/db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { updateAttachmentOp } from '#/modules/attachment/operations/update-attachment';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { usersTable } from '#/modules/user/user-db';
import { descriptionToSeed, descriptionToUpdate, stateToBlocksJson, YJS_FRAGMENT_NAME } from '#/modules/yjs/helpers/description-update';
import { mergeLog, mergeState } from '#/modules/yjs/helpers/yjs-state';
import { materializeDescriptionOp } from '#/modules/yjs/operations/materialize-description';
import { yjsDocumentsTable, yjsUpdatesTable } from '#/modules/yjs/yjs-db';
import { appendYjsUpdate, decodeLogNotice, YJS_LOG_CHANNEL, type YjsDocScope } from '#/modules/yjs/yjs-log';
import { mockStxBase } from '#/schemas/sync-transaction-mocks';
import { defaultHeaders } from './fixtures';
import { adminDb, expectRefusal } from './helpers';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './security/helpers';
import { seedAttachment } from './security/yjs-helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/** A paragraph under a fixed id: a write that keeps the id keeps the block's elements. */
const block = (id: string, text: string) => ({ id, type: 'paragraph', props: {}, content: [{ type: 'text', text, styles: {} }], children: [] });

const description = (...blocks: object[]) => JSON.stringify(blocks);

/** The text of each top-level block a state holds. */
const texts = (state: Uint8Array | null) =>
  state
    ? (JSON.parse(stateToBlocksJson(state)) as { content: { text?: string }[] }[]).map((one) => one.content.map((part) => part.text ?? '').join(''))
    : [];

/** Top-level children of the editor's fragment: one block group for one document, two when two histories merged. */
const blockGroups = (state: Uint8Array) => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  const groups = doc.getXmlFragment(YJS_FRAGMENT_NAME).length;
  doc.destroy();
  return groups;
};

/**
 * A description written outside the relay (REST, an MCP tool) becomes a server-origin update of the entity's live
 * document, in the writing transaction, and the relays hear of it at commit. Only a deletion retires the document. The
 * Yjs tables sit under RLS, so rows are arranged and read on the admin connection.
 */
describe.skipIf(appConfig.services.yjs.enabled === false)('Yjs outside writes', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;
  let listener: pg.Client;
  const heard: string[] = [];
  const removals: (() => Promise<void>)[] = [];

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'yjs-outside-write');
    listener = new pg.Client({ connectionString: testDatabaseUrl });
    await listener.connect();
    listener.on('notification', ({ channel, payload }) => {
      if (channel === YJS_LOG_CHANNEL) heard.push(payload ?? '');
    });
    await listener.query(`LISTEN ${YJS_LOG_CHANNEL}`);
  });

  afterAll(async () => {
    await listener.end();
    for (const remove of removals) await remove();
    await clearSecurityTestData();
  });

  /** An attachment holding `initial`, with its document as the relay seeds it from the row unless `seeded` is false. */
  const arrange = async (initial: string, { seeded = true } = {}) => {
    const attachment = await seedAttachment({
      tenantId: tenant.tenantId,
      organizationId: tenant.organization.id,
      createdBy: tenant.user.id,
      description: initial,
    });
    removals.push(async () => {
      await adminDb.delete(yjsUpdatesTable).where(eq(yjsUpdatesTable.entityId, attachment.id));
      await adminDb.delete(yjsDocumentsTable).where(eq(yjsDocumentsTable.entityId, attachment.id));
      await attachment.remove();
    });
    const scope: YjsDocScope = {
      entityType: 'attachment',
      entityId: attachment.id,
      tenantId: tenant.tenantId,
      organizationId: tenant.organization.id,
    };
    if (!seeded) return { attachment, scope, generation: '', seed: new Uint8Array() };
    // Each seed is a history of its own: an update that extends the document is diffed against this one.
    const seed = descriptionToSeed(initial);
    const [row] = await adminDb
      .insert(yjsDocumentsTable)
      .values({ ...scope, state: Buffer.from(seed) })
      .returning({ generation: yjsDocumentsTable.generation });
    return { attachment, scope, generation: row.generation, seed };
  };

  /** The document as stored: its generation, its log oldest first, and base and log merged. */
  const stored = async (entityId: string) => {
    const [document] = await adminDb
      .select({ state: yjsDocumentsTable.state, generation: yjsDocumentsTable.generation })
      .from(yjsDocumentsTable)
      .where(eq(yjsDocumentsTable.entityId, entityId));
    const log = await adminDb
      .select({ id: yjsUpdatesTable.id, payload: yjsUpdatesTable.payload, userId: yjsUpdatesTable.userId })
      .from(yjsUpdatesTable)
      .where(eq(yjsUpdatesTable.entityId, entityId))
      .orderBy(asc(yjsUpdatesTable.id));
    const rows = log.map((row) => ({ ...row, payload: new Uint8Array(row.payload) }));
    const state = document ? mergeLog(new Uint8Array(document.state), rows).state : null;
    return { generation: document?.generation ?? null, rows, state };
  };

  const put = (entityId: string, written: string) =>
    call(updateAttachment, {
      path: { organizationId: tenant.organization.id, tenantId: tenant.tenantId, id: entityId },
      body: {
        ops: { description: written },
        stx: { ...mockStxBase(`stx:${generateId()}`), fieldTimestamps: { description: generateServerHLC('test-client') } },
      },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });

  /** The context an MCP tool call runs its operation in: the tenant's user acting in the organization. */
  const toolContext = async () => {
    const [user] = await baseDb.select().from(usersTable).where(eq(usersTable.id, tenant.user.id));
    const bindings = await baseDb.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id));
    return {
      var: {
        user,
        userId: user.id,
        actor: { kind: 'user', id: user.id, bindings, scopes: null },
        isSystemAdmin: false,
        memberships: bindings,
        db: baseDb,
        tenantId: tenant.tenantId,
        organizationId: tenant.organization.id,
      },
    } as unknown as ActorContext; // a stand-in for the guards' context, with the fields the operation reads
  };

  /** The notices heard for one document. */
  const heardFor = (entityId: string) => heard.map(decodeLogNotice).filter((notice) => notice?.entityId === entityId);

  /** Returns once a notification sent now is heard: notifications arrive in commit order, so every earlier one has too. */
  const barrier = async () => {
    const token = `barrier-${randomUUID()}`;
    await adminDb.execute(sql`SELECT pg_notify(${YJS_LOG_CHANNEL}, ${token})`);
    await vi.waitUntil(() => heard.includes(token), { timeout: 5000, interval: 10 });
  };

  /** Resolves once `count` sessions on this worker's database wait for a lock. */
  const lockWaiters = (count: number) =>
    vi.waitUntil(
      async () => {
        const { rows } = await adminDb.execute<{ waiting: number }>(
          sql`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`,
        );
        return rows[0].waiting >= count;
      },
      { timeout: 5000, interval: 10 },
    );

  /** A transaction holding the attachment row FOR UPDATE until released, as a write in flight holds it. */
  const holdRow = async (entityId: string) => {
    const held = Promise.withResolvers<void>();
    const released = Promise.withResolvers<void>();
    const done = adminDb.transaction(async (tx) => {
      await tx.select({ id: attachmentsTable.id }).from(attachmentsTable).where(eq(attachmentsTable.id, entityId)).for('update');
      held.resolve();
      await released.promise;
    });
    await Promise.race([held.promise, done]);
    return { release: () => released.resolve(), done };
  };

  /** A relay append of a client's update, as the relay's storage makes it, held uncommitted until released. */
  const holdAppend = async (scope: YjsDocScope, update: Uint8Array, generation: string) => {
    const appended = Promise.withResolvers<void>();
    const released = Promise.withResolvers<void>();
    const done = baseDb.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${scope.tenantId}, true), set_config('app.user_id', '', true)`);
      const result = await appendYjsUpdate(tx, scope, update, { userId: tenant.user.id, generation, notify: false });
      appended.resolve();
      await released.promise;
      return result;
    });
    await Promise.race([appended.promise, done]);
    return { release: () => released.resolve(), done };
  };

  it('appends nothing for an entity with no document, and seeds none (1)', async () => {
    const { attachment } = await arrange(description(block('a', 'original')), { seeded: false });
    const { response } = await put(attachment.id, description(block('a', 'rewritten elsewhere')));
    expect(response.status).toBe(200);
    expect((await attachment.read())?.description).toContain('rewritten elsewhere');
    expect(await stored(attachment.id)).toEqual({ generation: null, rows: [], state: null });
  });

  it('turns a write into one server-origin update of the live document, announced at commit, under the same generation (2, 8)', async () => {
    const { attachment, generation } = await arrange(description(block('a', 'original'), block('b', 'kept')));
    const written = description(block('a', 'rewritten elsewhere'), block('b', 'kept'));
    const { response } = await put(attachment.id, written);
    expect(response.status).toBe(200);

    const after = await stored(attachment.id);
    expect(after.generation).toBe(generation);
    expect(after.rows.map((row) => row.userId)).toEqual([null]);
    expect(after.state && stateToBlocksJson(after.state)).toBe(stateToBlocksJson(descriptionToSeed(written)));
    expect((await attachment.read())?.description).toBe(written);

    await barrier();
    expect(heardFor(attachment.id)).toEqual([
      { tenantId: tenant.tenantId, entityType: 'attachment', entityId: attachment.id, logId: after.rows[0].id },
    ]);
  });

  it('appends one update per write, and the document reads as the last (2)', async () => {
    const { attachment } = await arrange(description(block('a', 'one')));
    expect((await put(attachment.id, description(block('a', 'two')))).response.status).toBe(200);
    expect((await put(attachment.id, description(block('a', 'three'), block('b', 'and more')))).response.status).toBe(200);

    const after = await stored(attachment.id);
    expect(after.rows.map((row) => row.userId)).toEqual([null, null]);
    expect(texts(after.state)).toEqual(['three', 'and more']);
    expect(blockGroups(after.state!)).toBe(1);
  });

  it('appends nothing for a write that leaves the document as it is (3)', async () => {
    const initial = description(block('a', 'original'));
    const { attachment } = await arrange(initial);
    expect((await put(attachment.id, initial)).response.status).toBe(200);
    // The same blocks, serialized otherwise: the row changes, the document does not.
    expect((await put(attachment.id, JSON.stringify(JSON.parse(initial), null, 2))).response.status).toBe(200);
    expect((await stored(attachment.id)).rows).toEqual([]);
  });

  it('writes an empty description as one empty paragraph, in one block group (4)', async () => {
    const { attachment } = await arrange(description(block('a', 'original'), block('b', 'more')));
    expect((await put(attachment.id, '')).response.status).toBe(200);

    const after = await stored(attachment.id);
    expect(after.rows).toHaveLength(1);
    expect(blockGroups(after.state!)).toBe(1);
    expect(JSON.parse(stateToBlocksJson(after.state!))).toMatchObject([{ type: 'paragraph', content: [] }]);
  });

  it('must not take a description the editor schema cannot hold where a document exists: 400, and nothing is written (5, 8, D9)', async () => {
    const initial = description(block('a', 'original'));
    const undrawable = description({ id: 'x', type: 'no-such-block', props: {}, content: [], children: [] });
    const { attachment } = await arrange(initial);

    await expectRefusal(await put(attachment.id, undrawable), 400, 'invalid_request');
    expect((await attachment.read())?.description).toBe(initial);
    expect((await stored(attachment.id)).rows).toEqual([]);
    await barrier();
    expect(heardFor(attachment.id)).toEqual([]);

    // With no document, the description is the row's alone, as before.
    const { attachment: plain } = await arrange(initial, { seeded: false });
    expect((await put(plain.id, undrawable)).response.status).toBe(200);
    expect((await plain.read())?.description).toBe(undrawable);
  });

  it('overwrites an earlier edit where the write differs, and keeps an edit committed after its read (6)', async () => {
    const two = [block('one', 'Status: draft'), block('two', 'Could you have a look?')];
    const { attachment, scope, generation, seed } = await arrange(description(...two));

    // A client edit the relay logged before the write, in the block the write changes.
    const reviewed = description(block('one', 'Status: review'), two[1]);
    const earlier = descriptionToUpdate(seed, reviewed)!;
    await adminDb.insert(yjsUpdatesTable).values({ ...scope, userId: tenant.user.id, payload: Buffer.from(earlier) });
    // A client edit in the other block, which the relay appends while the write runs and commits after its read.
    const later = descriptionToUpdate(
      mergeState(seed, [earlier]),
      description(block('one', 'Status: review'), block('two', 'Could you have a look? Again')),
    )!;
    const append = await holdAppend(scope, later, generation);

    const { response } = await put(attachment.id, description(block('one', 'Status: done'), two[1]));
    expect(response.status).toBe(200);
    append.release();
    expect((await append.done).status).toBe('appended');

    const after = await stored(attachment.id);
    expect(after.rows.map((row) => row.userId)).toEqual([tenant.user.id, tenant.user.id, null]);
    expect(texts(after.state)).toEqual(['Status: done', 'Could you have a look? Again']);
  });

  it('serializes concurrent writes on the entity row: the document reads as the last, in one block group (7)', async () => {
    const { attachment } = await arrange(description(block('one', 'Status: draft')));
    const holder = await holdRow(attachment.id);
    const first = put(attachment.id, description(block('one', 'Status: review')));
    await lockWaiters(1);
    const second = put(attachment.id, description(block('one', 'Status: done')));
    await lockWaiters(2);
    holder.release();
    await holder.done;
    expect([(await first).response.status, (await second).response.status]).toEqual([200, 200]);

    const after = await stored(attachment.id);
    expect((await attachment.read())?.description).toContain('Status: done');
    expect(after.rows).toHaveLength(2);
    expect(texts(after.state)).toEqual(['Status: done']);
    expect(blockGroups(after.state!)).toBe(1);
  });

  it('records a server-clock write outside the relay, as an MCP tool makes it, like a REST write (11)', async () => {
    const { attachment } = await arrange(description(block('a', 'original')));
    // The MCP update tool builds its transaction on the server, so it takes the server clock; it is no materialization.
    await updateAttachmentOp(
      await toolContext(),
      attachment.id,
      { ops: { description: description(block('a', 'written by a tool')) }, stx: { ...mockStxBase(`stx:${generateId()}`) } },
      { serverOrigin: true },
    );
    const after = await stored(attachment.id);
    expect(after.rows.map((row) => row.userId)).toEqual([null]);
    expect(texts(after.state)).toEqual(['written by a tool']);
  });

  it("records nothing for the relay's own write (10)", async () => {
    const { attachment, scope, generation } = await arrange(description(block('a', 'original')));
    await materializeDescriptionOp({ ...scope, description: description(block('a', 'written by the relay')), editors: [tenant.user.id] });
    expect((await attachment.read())?.description).toContain('written by the relay');
    expect(await stored(attachment.id)).toMatchObject({ generation, rows: [] });
  });

  it('retires the document of a deleted attachment, base and log, and announces it (9)', async () => {
    const { attachment } = await arrange(description(block('a', 'original')));
    expect((await put(attachment.id, description(block('a', 'logged')))).response.status).toBe(200);
    expect((await stored(attachment.id)).rows).toHaveLength(1);

    const { response } = await call(deleteAttachments, {
      path: { organizationId: tenant.organization.id, tenantId: tenant.tenantId },
      body: { ids: [attachment.id], stx: { mutationId: generateId(), sourceId: 'yjs-outside-write' } },
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });
    expect(response.status).toBe(200);
    expect(await stored(attachment.id)).toEqual({ generation: null, rows: [], state: null });
    await barrier();
    expect(heardFor(attachment.id).at(-1)).toEqual({ tenantId: tenant.tenantId, entityType: 'attachment', entityId: attachment.id, retired: true });
  });
});
