import { randomUUID } from 'node:crypto';
import { asc, eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { deleteAttachments, type PullYjsDocumentResponse, pullYjsDocument, pushYjsUpdate, updateAttachment } from 'sdk';
import { appConfig } from 'shared';
import { testDatabaseUrl } from 'shared/test-db';
import { assumeMemberAttachmentPolicy } from 'shared/testing/member-policy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { generateServerHLC } from '#/core/stx';
import { subjectSegment } from '#/middlewares/rate-limiter/helpers';
import { yjsHttpLimiter } from '#/middlewares/rate-limiter/limiters';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { rateLimitsTable } from '#/modules/auth/rate-limits-db';
import { stateToBlocksJson, YJS_FRAGMENT_NAME } from '#/modules/yjs/helpers/description-update';
import { decodeLogNotice, YJS_HTTP_CHUNK_BYTES, YJS_LOG_CHANNEL } from '#/modules/yjs/helpers/yjs-log';
import { mergeLog } from '#/modules/yjs/helpers/yjs-state';
import type { AppendYjsUpdateOpts } from '#/modules/yjs/operations/append-yjs-update';
import { yjsDocumentsTable, yjsUpdatesTable } from '#/modules/yjs/yjs-db';
import { mockStxBase } from '#/schemas/sync-transaction-mocks';
import { defaultHeaders } from './fixtures';
import { adminDb, createSystemAdminUser, createTestSession, type ErrorResponse, expectRefusal, rawJsonRequest } from './helpers';
import { clearSecurityTestData, createOrgUser, createTestTenant, type TestTenant } from './security/helpers';
import { lockWaiters, paragraph, seedAttachment } from './security/yjs-helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

// The real per-user limiter, so its 429 is proven here: every request in the file counts in its buckets.
vi.unmock('#/middlewares/rate-limiter/core');

/** A gate an operation waits at, holding its transaction open, until released; `fail` then throws in that transaction. */
interface Hold {
  reached: () => void;
  release: Promise<void>;
  fail?: boolean;
}

/** When set, the next append waits here after inserting its row, before its transaction commits. */
let appendHold: Hold | null = null;
/** The options of every append, in order. */
const appends: AppendYjsUpdateOpts[] = [];
vi.mock('#/modules/yjs/operations/append-yjs-update', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/modules/yjs/operations/append-yjs-update')>();
  return {
    ...actual,
    appendYjsUpdate: async (...args: Parameters<typeof actual.appendYjsUpdate>) => {
      appends.push(args[1]);
      const result = await actual.appendYjsUpdate(...args);
      const hold = appendHold;
      appendHold = null;
      if (hold) {
        hold.reached();
        await hold.release;
        if (hold.fail) throw new Error('the request fails after its append');
      }
      return result;
    },
  };
});

/** When set, the next seed waits here after its FOR SHARE read of the entity row, holding the lock. */
let seedHold: Hold | null = null;
vi.mock('#/modules/yjs/yjs-queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/modules/yjs/yjs-queries')>();
  return {
    ...actual,
    findEntityDescriptionForShare: async (...args: Parameters<typeof actual.findEntityDescriptionForShare>) => {
      const read = await actual.findEntityDescriptionForShare(...args);
      const hold = seedHold;
      seedHold = null;
      if (hold) {
        hold.reached();
        await hold.release;
      }
      return read;
    },
  };
});

/** Arms `kind`'s gate: resolves `reached` once an operation waits at it, which `release` lets go. */
function armHold(kind: 'append' | 'seed', { fail = false } = {}) {
  const reached = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  const hold = { reached: reached.resolve, release: released.promise, fail };
  if (kind === 'append') appendHold = hold;
  else seedHold = hold;
  return { reached: reached.promise, release: () => released.resolve() };
}

const toBase64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const fromBase64url = (value: string) => new Uint8Array(Buffer.from(value, 'base64url'));

/** The state vector of a client that holds nothing. */
const emptyVector = Y.encodeStateVector(new Y.Doc());

/** A client document holding `updates`. */
const docOf = (...updates: Uint8Array[]) => {
  const doc = new Y.Doc();
  for (const update of updates) Y.applyUpdate(doc, update);
  return doc;
};

/** The text of each top-level block a document holds. */
const textsOf = (state: Uint8Array) =>
  (JSON.parse(stateToBlocksJson(state)) as { content: { text?: string }[] }[]).map((block) => block.content.map((part) => part.text ?? '').join(''));

/** The first text node of the editor's fragment: the first paragraph's. */
function firstText(doc: Y.Doc): Y.XmlText {
  const find = (node: Y.XmlFragment | Y.XmlElement): Y.XmlText | null => {
    for (const child of node.toArray()) {
      if (child instanceof Y.XmlText) return child;
      if (child instanceof Y.XmlElement) {
        const found = find(child);
        if (found) return found;
      }
    }
    return null;
  };
  const text = find(doc.getXmlFragment(YJS_FRAGMENT_NAME));
  if (!text) throw new Error('no text in the document');
  return text;
}

/** A local edit: `text` typed at the start of the first paragraph, as the one update the edit makes. */
function typeInto(doc: Y.Doc, text: string): Uint8Array {
  const before = Y.encodeStateVector(doc);
  firstText(doc).insert(0, text);
  return Y.encodeStateAsUpdate(doc, before);
}

/** The top-level children of the editor's fragment: one block group for one document. */
const blockGroups = (state: Uint8Array) => docOf(state).getXmlFragment(YJS_FRAGMENT_NAME).length;

/**
 * Yjs over HTTP: a client that cannot reach the relay pulls and pushes through the API. Both routes authorize as the
 * token route does; a pull seeds a document never opened, and a push appends through the log's one way in, notifying
 * the relays only once it committed. Yjs rows sit under RLS, so they are arranged and read on the admin connection.
 */
describe.skipIf(appConfig.services.yjs.enabled === false)('Yjs over HTTP', async () => {
  assumeMemberAttachmentPolicy({ read: 1, update: 'own', delete: 'own' });
  const call = await createAppClient();
  let owner: TestTenant;
  let other: TestTenant;
  let member: Awaited<ReturnType<typeof createOrgUser>>;
  let listener: pg.Client;
  const heard: string[] = [];
  const removals: (() => Promise<void>)[] = [];

  const ownScope = () => ({ tenantId: owner.tenantId, organizationId: owner.organization.id });
  const headers = (cookie?: string) => (cookie ? { ...defaultHeaders, Cookie: cookie } : defaultHeaders);

  const pull = (cookie: string | undefined, entityId: string, vector = emptyVector, scope = ownScope()) =>
    call(pullYjsDocument, {
      path: scope,
      body: { entityType: 'attachment', entityId, stateVector: toBase64url(vector) },
      headers: headers(cookie),
    });

  const push = (cookie: string | undefined, entityId: string, generation: string, update: Uint8Array, scope = ownScope()) =>
    call(pushYjsUpdate, {
      path: scope,
      body: { entityType: 'attachment', entityId, generation, update: toBase64url(update) },
      headers: headers(cookie),
    });

  /** A pull's answer, decoded; fails the test on a refusal. */
  const pulled = async (answer: ReturnType<typeof pull>) => {
    const { data, response } = await answer;
    expect(response.status).toBe(200);
    if (!data) throw new Error('the pull must answer');
    const { generation, update, stateVector } = data as PullYjsDocumentResponse;
    return { generation, update: fromBase64url(update), stateVector: fromBase64url(stateVector) };
  };

  /** An attachment in `tenant` holding `description`, created by `createdBy` (the tenant's user by default). */
  const arrange = async (description: string | null, { tenant = owner, createdBy }: { tenant?: TestTenant; createdBy?: string } = {}) => {
    const attachment = await seedAttachment({
      tenantId: tenant.tenantId,
      organizationId: tenant.organization.id,
      createdBy: createdBy ?? tenant.user.id,
      description: '',
    });
    await adminDb.update(attachmentsTable).set({ description }).where(eq(attachmentsTable.id, attachment.id));
    removals.push(async () => {
      await adminDb.delete(yjsUpdatesTable).where(eq(yjsUpdatesTable.entityId, attachment.id));
      await adminDb.delete(yjsDocumentsTable).where(eq(yjsDocumentsTable.entityId, attachment.id));
      await attachment.remove();
    });
    return attachment;
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

  /** The notices heard for one document. */
  const heardFor = (entityId: string) => heard.map(decodeLogNotice).filter((notice) => notice?.entityId === entityId);

  /** Returns once a notification sent now is heard: notifications arrive in commit order, so every earlier one has too. */
  const barrier = async () => {
    const token = `barrier-${randomUUID()}`;
    await adminDb.execute(sql`SELECT pg_notify(${YJS_LOG_CHANNEL}, ${token})`);
    await vi.waitUntil(() => heard.includes(token), { timeout: 5000, interval: 10 });
  };

  beforeAll(async () => {
    owner = await createTestTenant(call, 'yjs-http-owner');
    other = await createTestTenant(call, 'yjs-http-other');
    member = await createOrgUser(call, owner.tenantId, owner.organization.id, 'yjs-http-member');
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

  describe('pull (30)', () => {
    it('seeds a document never opened from its description, and answers all of it with its generation and vector', async () => {
      const attachment = await arrange(paragraph('original'));
      expect(await stored(attachment.id)).toEqual({ generation: null, rows: [], state: null });

      const answer = await pulled(pull(owner.sessionCookie, attachment.id));
      const after = await stored(attachment.id);
      expect(answer.generation).toBe(after.generation);
      expect(after.rows).toEqual([]);
      expect(textsOf(answer.update)).toEqual(['original']);
      expect(Y.decodeStateVector(answer.stateVector)).toEqual(Y.decodeStateVector(Y.encodeStateVector(docOf(after.state!))));

      // A second pull reads the same document: one seed, one generation.
      expect((await pulled(pull(owner.sessionCookie, attachment.id))).generation).toBe(answer.generation);
      // A seed appends nothing, so nothing is announced.
      await barrier();
      expect(heardFor(attachment.id)).toEqual([]);
    });

    it('seeds a document with no description as one empty paragraph', async () => {
      const attachment = await arrange(null);
      const answer = await pulled(pull(owner.sessionCookie, attachment.id));
      expect(blockGroups(answer.update)).toBe(1);
      expect(JSON.parse(stateToBlocksJson(answer.update))).toMatchObject([{ type: 'paragraph', content: [] }]);
    });

    it('answers only what the caller lacks: the structs it never saw, and the server vector', async () => {
      const attachment = await arrange(paragraph('original'));
      const first = await pulled(pull(owner.sessionCookie, attachment.id));
      const reader = docOf(first.update);
      const writer = docOf(first.update);
      const typed = typeInto(writer, 'typed ');
      expect((await push(owner.sessionCookie, attachment.id, first.generation, typed)).response.status).toBe(200);

      const second = await pulled(pull(owner.sessionCookie, attachment.id, Y.encodeStateVector(reader)));
      // Only the writer's structs: the seed the reader holds is not sent again.
      expect(new Set(Y.decodeUpdate(second.update).structs.map((struct) => struct.id.client))).toEqual(new Set([writer.clientID]));
      expect(second.update.length).toBeLessThan(first.update.length);
      Y.applyUpdate(reader, second.update);
      expect(textsOf(Y.encodeStateAsUpdate(reader))).toEqual(['typed original']);
      expect(Y.decodeStateVector(second.stateVector)).toEqual(Y.decodeStateVector(Y.encodeStateVector(writer)));

      // A caller that holds everything gets no structs.
      const current = await pulled(pull(owner.sessionCookie, attachment.id, Y.encodeStateVector(writer)));
      expect(Y.decodeUpdate(current.update).structs).toEqual([]);
    });

    it('must not take a state vector Yjs cannot decode: 400, and nothing is seeded', async () => {
      const attachment = await arrange(paragraph('original'));
      await expectRefusal(await pull(owner.sessionCookie, attachment.id, new Uint8Array([5, 1])), 400, 'invalid_request');
      expect((await stored(attachment.id)).generation).toBeNull();
    });
  });

  describe('refusals (31)', () => {
    it('must not pull or push without a session', async () => {
      const attachment = await arrange(paragraph('original'));
      await expectRefusal(await pull(undefined, attachment.id), 401, 'unauthorized', 'pull');
      await expectRefusal(await push(undefined, attachment.id, randomUUID(), new Uint8Array([0, 0])), 401, 'unauthorized', 'push');
    });

    it('must not let a member who may read but not update the entity pull or push: 403, view only', async () => {
      // Members update their own attachments only ('own' in the permission config).
      const attachment = await arrange(paragraph('original'));
      const { generation } = await pulled(pull(owner.sessionCookie, attachment.id));
      await expectRefusal(await pull(member.sessionCookie, attachment.id), 403, 'forbidden', 'pull');
      await expectRefusal(await push(member.sessionCookie, attachment.id, generation, new Uint8Array([0, 0])), 403, 'forbidden', 'push');

      // Positive control: a member edits what they created.
      const own = await arrange(paragraph('theirs'), { createdBy: member.id });
      const theirs = await pulled(pull(member.sessionCookie, own.id));
      expect((await push(member.sessionCookie, own.id, theirs.generation, typeInto(docOf(theirs.update), 'mine '))).response.status).toBe(200);
    });

    it('must not let a system admin without a membership that grants update pull or push: collaboration confers no bypass', async () => {
      const attachment = await arrange(paragraph('original'));
      const { generation } = await pulled(pull(owner.sessionCookie, attachment.id));
      const admin = await createSystemAdminUser('yjs-http-sysadmin@security-test.com');
      const adminCookie = await createTestSession(admin);
      await expectRefusal(await pull(adminCookie, attachment.id), 403, 'forbidden', 'pull');
      await expectRefusal(await push(adminCookie, attachment.id, generation, new Uint8Array([0, 0])), 403, 'forbidden', 'push');
    });

    it('answers 404, deleted, for a missing, a soft-deleted and an out-of-scope entity, and seeds nothing for them', async () => {
      const deleted = await arrange(paragraph('gone'));
      await adminDb.update(attachmentsTable).set({ deletedAt: sql`now()`, deletedBy: owner.user.id }).where(eq(attachmentsTable.id, deleted.id));
      const theirs = await arrange(paragraph('theirs'), { tenant: other });

      for (const [label, entityId] of [
        ['missing', generateId()],
        ['soft-deleted', deleted.id],
        ['in another tenant and organization', theirs.id],
      ]) {
        await expectRefusal(await pull(owner.sessionCookie, entityId), 404, 'not_found', `pull ${label}`);
        await expectRefusal(await push(owner.sessionCookie, entityId, randomUUID(), new Uint8Array([0, 0])), 404, 'not_found', `push ${label}`);
      }
      expect((await stored(deleted.id)).generation).toBeNull();
      expect((await stored(theirs.id)).generation).toBeNull();
    });

    it("must not pull or push through another tenant's path: the tenant guard answers 403", async () => {
      const theirs = await arrange(paragraph('theirs'), { tenant: other });
      const theirScope = { tenantId: other.tenantId, organizationId: other.organization.id };
      await expectRefusal(await pull(owner.sessionCookie, theirs.id, emptyVector, theirScope), 403, 'forbidden', 'pull');
      await expectRefusal(await push(owner.sessionCookie, theirs.id, randomUUID(), new Uint8Array([0, 0]), theirScope), 403, 'forbidden', 'push');
      expect((await stored(theirs.id)).generation).toBeNull();
    });
  });

  describe('push (32)', () => {
    it("appends under the caller and answers after the commit: the 200 is the client's Saved", async () => {
      const attachment = await arrange(paragraph('original'));
      const { generation, update } = await pulled(pull(owner.sessionCookie, attachment.id));
      const { data, response } = await push(owner.sessionCookie, attachment.id, generation, typeInto(docOf(update), 'typed '));
      expect(response.status).toBe(200);
      expect(data).toEqual({ status: 'appended' });

      const after = await stored(attachment.id);
      expect(after.rows.map((row) => row.userId)).toEqual([owner.user.id]);
      expect(textsOf(after.state!)).toEqual(['typed original']);
    });

    it('announces an append once it committed, never before, one notification per request', async () => {
      const attachment = await arrange(paragraph('original'));
      const { generation, update } = await pulled(pull(owner.sessionCookie, attachment.id));
      const client = docOf(update);

      const gate = armHold('append');
      const pushing = push(owner.sessionCookie, attachment.id, generation, typeInto(client, 'one '));
      await gate.reached;
      // The append notifies nothing in its transaction, so the commit never queues behind the database-wide notify lock.
      expect(appends.at(-1)).toMatchObject({ userId: owner.user.id, generation, notify: false });
      // The row is inserted and its transaction still open: no one sees it, and no relay hears of it.
      await barrier();
      expect(heardFor(attachment.id)).toEqual([]);
      expect((await stored(attachment.id)).rows).toEqual([]);
      gate.release();
      expect((await pushing).response.status).toBe(200);

      const [first] = (await stored(attachment.id)).rows;
      await barrier();
      expect(heardFor(attachment.id)).toEqual([{ tenantId: owner.tenantId, entityType: 'attachment', entityId: attachment.id, logIds: [first.id] }]);

      // Each request sends its own: two pushes, two notifications, each with its row.
      expect((await push(owner.sessionCookie, attachment.id, generation, typeInto(client, 'two '))).response.status).toBe(200);
      expect((await push(owner.sessionCookie, attachment.id, generation, typeInto(client, 'three '))).response.status).toBe(200);
      const rows = (await stored(attachment.id)).rows;
      await barrier();
      expect(heardFor(attachment.id).map((notice) => notice && 'logIds' in notice && notice.logIds)).toEqual(rows.map((row) => [row.id]));
    });

    it('must not log or announce an append whose transaction rolls back', async () => {
      const attachment = await arrange(paragraph('original'));
      const { generation, update } = await pulled(pull(owner.sessionCookie, attachment.id));

      armHold('append', { fail: true }).release();
      const { response } = await push(owner.sessionCookie, attachment.id, generation, typeInto(docOf(update), 'lost '));
      expect(response.status).toBe(500);
      expect((await stored(attachment.id)).rows).toEqual([]);
      await barrier();
      expect(heardFor(attachment.id)).toEqual([]);
    });

    it('answers an update that carries nothing with empty, and logs and announces nothing', async () => {
      const attachment = await arrange(paragraph('original'));
      const { generation, update } = await pulled(pull(owner.sessionCookie, attachment.id));
      // The handshake post of a client that holds nothing the server lacks.
      const nothing = Y.encodeStateAsUpdate(docOf(update), Y.encodeStateVector(docOf(update)));
      const { data, response } = await push(owner.sessionCookie, attachment.id, generation, nothing);
      expect(response.status).toBe(200);
      expect(data).toEqual({ status: 'empty' });
      expect((await stored(attachment.id)).rows).toEqual([]);
      await barrier();
      expect(heardFor(attachment.id)).toEqual([]);
    });

    it('must not log an update Yjs cannot decode: 400', async () => {
      const attachment = await arrange(paragraph('original'));
      const { generation } = await pulled(pull(owner.sessionCookie, attachment.id));
      await expectRefusal(await push(owner.sessionCookie, attachment.id, generation, new Uint8Array([255, 255, 255])), 400, 'invalid_request');
      expect((await stored(attachment.id)).rows).toEqual([]);
    });

    it('must not log an update of another generation: 409 with the current one', async () => {
      const attachment = await arrange(paragraph('original'));
      const { generation, update } = await pulled(pull(owner.sessionCookie, attachment.id));
      const answer = await push(owner.sessionCookie, attachment.id, randomUUID(), typeInto(docOf(update), 'stale '));
      await expectRefusal(answer, 409, 'sync_document_replaced');
      expect((answer.error as ErrorResponse).meta).toEqual({ generation });
      expect((await stored(attachment.id)).rows).toEqual([]);
    });

    it('must not log an update of a document with no row: 409 with a null generation, and a pull, which seeds, lets it in', async () => {
      const attachment = await arrange(paragraph('original'));
      const offline = docOf();
      offline.getXmlFragment(YJS_FRAGMENT_NAME).insert(0, [new Y.XmlText('offline')]);
      const answer = await push(owner.sessionCookie, attachment.id, randomUUID(), Y.encodeStateAsUpdate(offline));
      await expectRefusal(answer, 409, 'sync_document_replaced');
      expect((answer.error as ErrorResponse).meta).toEqual({ generation: null });
      expect(await stored(attachment.id)).toEqual({ generation: null, rows: [], state: null });

      // The client's recovery: pull, then post again in the generation the pull named.
      const { generation, update } = await pulled(pull(owner.sessionCookie, attachment.id));
      expect((await push(owner.sessionCookie, attachment.id, generation, typeInto(docOf(update), 'then '))).response.status).toBe(200);
    });

    it('must not accept an update past the 512 KB chunk, nor a body past the 1 MB limit', async () => {
      const attachment = await arrange(paragraph('original'));
      const { generation } = await pulled(pull(owner.sessionCookie, attachment.id));
      const pushOf = (update: string) =>
        rawJsonRequest(`/${owner.tenantId}/${owner.organization.id}/yjs/push`, owner.sessionCookie, {
          method: 'POST',
          body: { entityType: 'attachment', entityId: attachment.id, generation, update },
        });
      const chunk = (bytes: number) => Buffer.alloc(bytes).toString('base64url');

      await expectRefusal(await pushOf(chunk(YJS_HTTP_CHUNK_BYTES + 1)), 400, 'form.too_big');
      await expectRefusal(await pushOf(chunk(800 * 1024)), 413, 'body_too_large');
      // A full chunk passes validation (positive control): zeros decode as an update that carries nothing.
      const full = await pushOf(chunk(YJS_HTTP_CHUNK_BYTES));
      expect(full).toEqual({ status: 200, body: { status: 'empty' } });
    });

    it('must not serve a user past the shared hourly budget: 429', async () => {
      const limited = await createOrgUser(call, owner.tenantId, owner.organization.id, 'yjs-http-limited');
      const own = await arrange(paragraph('theirs'), { createdBy: limited.id });
      expect((await pull(limited.sessionCookie, own.id)).response.status).toBe(200);

      // The budget is spent, by pulls and pushes alike.
      const key = `${yjsHttpLimiter.keyPrefix}:${subjectSegment('userId', limited.id)}`;
      const [bucket] = await adminDb
        .update(rateLimitsTable)
        .set({ points: yjsHttpLimiter.buckets[0].limits.points })
        .where(eq(rateLimitsTable.key, key))
        .returning({ key: rateLimitsTable.key });
      expect(bucket?.key).toBe(key);

      await expectRefusal(await pull(limited.sessionCookie, own.id), 429, 'too_many_requests', 'pull');
      await expectRefusal(await push(limited.sessionCookie, own.id, randomUUID(), new Uint8Array([0, 0])), 429, 'too_many_requests', 'push');
    });
  });

  it('must not leave a push in flight behind a retirement: the deletion waits for it, then takes its row (33)', async () => {
    const attachment = await arrange(paragraph('original'));
    const { generation, update } = await pulled(pull(owner.sessionCookie, attachment.id));

    const gate = armHold('append');
    const pushing = push(owner.sessionCookie, attachment.id, generation, typeInto(docOf(update), 'late '));
    await gate.reached;
    // The delete retires the document in its transaction: its delete of the document row waits for the push's key share.
    const deleting = call(deleteAttachments, {
      path: ownScope(),
      body: { ids: [attachment.id], stx: { mutationId: generateId(), sourceId: 'yjs-http' } },
      headers: headers(owner.sessionCookie),
    });
    await lockWaiters(1);
    gate.release();
    expect((await pushing).response.status).toBe(200);
    expect((await deleting).response.status).toBe(200);

    expect(await stored(attachment.id)).toEqual({ generation: null, rows: [], state: null });
    // The client is told the entity is gone, and nothing seeds it again.
    await expectRefusal(await push(owner.sessionCookie, attachment.id, generation, typeInto(docOf(update), 'later ')), 404, 'not_found');
    await expectRefusal(await pull(owner.sessionCookie, attachment.id), 404, 'not_found');
    expect((await stored(attachment.id)).generation).toBeNull();
  });

  describe('a seed against an outside write (34)', () => {
    /** A REST write of the description, as an outside write makes it. */
    const put = (entityId: string, description: string) =>
      call(updateAttachment, {
        path: { ...ownScope(), id: entityId },
        body: {
          ops: { description },
          stx: { ...mockStxBase(`stx:${generateId()}`), fieldTimestamps: { description: generateServerHLC('test-client') } },
        },
        headers: headers(owner.sessionCookie),
      });

    it('must not lose a write committing as the first pull seeds: the seed waits for it and reads it', async () => {
      const attachment = await arrange(paragraph('old'));
      // The write holds the entity row; with no document row yet, it appends nothing.
      const written = Promise.withResolvers<void>();
      const committed = Promise.withResolvers<void>();
      const write = adminDb.transaction(async (tx) => {
        await tx
          .update(attachmentsTable)
          .set({ description: paragraph('written') })
          .where(eq(attachmentsTable.id, attachment.id));
        written.resolve();
        await committed.promise;
      });
      await written.promise;
      const pulling = pull(owner.sessionCookie, attachment.id);
      await lockWaiters(1);
      committed.resolve();
      await write;

      expect(textsOf((await pulled(pulling)).update)).toEqual(['written']);
    });

    it('must not lose a write that waits for the seed: it finds the document row the seed made and appends into it', async () => {
      const attachment = await arrange(paragraph('old'));
      const gate = armHold('seed');
      const pulling = pull(owner.sessionCookie, attachment.id);
      await gate.reached;
      // The seed holds the entity row FOR SHARE: the write's UPDATE waits for the seed's commit.
      const writing = put(attachment.id, paragraph('written'));
      await lockWaiters(1);
      gate.release();

      const first = await pulled(pulling);
      expect(textsOf(first.update)).toEqual(['old']);
      expect((await writing).response.status).toBe(200);

      // The write is a server-origin row of the seeded document, which the client's next pull brings.
      const after = await stored(attachment.id);
      expect(after.generation).toBe(first.generation);
      expect(after.rows.map((row) => row.userId)).toEqual([null]);
      const client = docOf(first.update);
      Y.applyUpdate(client, (await pulled(pull(owner.sessionCookie, attachment.id, Y.encodeStateVector(client)))).update);
      expect(textsOf(Y.encodeStateAsUpdate(client))).toEqual(['written']);
      expect(blockGroups(Y.encodeStateAsUpdate(client))).toBe(1);
    });
  });
});
