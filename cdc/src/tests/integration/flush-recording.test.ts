import { eq, inArray, sql } from 'drizzle-orm';
import { appConfig, hierarchy } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoidTenant } from 'shared/utils/nanoid';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { activitiesTable } from '#/modules/activities/activities-db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { mockAttachment } from '#/modules/attachment/attachment-mocks';
import { organizationsTable } from '#/modules/organization/organization-db';
import { mockOrganization } from '#/modules/organization/organization-mocks';
import { cdcDb } from '../../lib/db';
import { wsClient } from '../../network/websocket-client';
import { parseMessage } from '../../pipeline/parse-message';
import { processFlush } from '../../pipeline/process-events';
import { circuitBreaker } from '../../services/circuit-breaker';
import type { PendingEvent } from '../../types';
import { dmlMessage } from '../factories';

/** Whether the configured database holds the migrated schema these tests write to. */
async function probeReady(): Promise<boolean> {
  try {
    await cdcDb.execute(sql`SELECT apply_count_deltas('{}'::jsonb, '{}'::jsonb)`);
    return true;
  } catch {
    return false;
  }
}

const READY = await probeReady();

/**
 * A flush records its events in one transaction: activity rows, sequence positions, counters and row stamps. The
 * events here are built from real rows through the real parser and handed to `processFlush` directly, so a second
 * delivery is simply a second call with the same LSNs.
 */
describe.skipIf(!READY)('Recording a flush (integration)', () => {
  const tenantId = nanoidTenant();
  const organizationId = generateId();
  const attachmentIds: string[] = [];
  let lsnCounter = 0x1000;
  const committedAt = new Map<string, string>();
  /** What the worker sent to the API, as activity payloads. */
  let dispatched: { subjectId: string | null; seq?: number; batchRows?: { seq?: number; rowData: { id: string } }[] }[] = [];

  beforeAll(async () => {
    await cdcDb.execute(sql`INSERT INTO tenants (id, name) VALUES (${tenantId}, ${`flush-${tenantId}`})`);
    await cdcDb
      .insert(organizationsTable)
      .values({ ...mockOrganization(), id: organizationId, tenantId, slug: `flush-${tenantId}`, createdBy: null });
    vi.spyOn(wsClient, 'send').mockImplementation((payload: unknown) => {
      const { activity, batchRows } = payload as { activity?: { subjectId: string | null; seq?: number }; batchRows?: never };
      if (activity) dispatched.push({ subjectId: activity.subjectId, seq: activity.seq, batchRows });
      return true;
    });
  });

  beforeEach(() => {
    dispatched = [];
    // The singleton keeps its circuits across tests.
    (circuitBreaker as unknown as { circuits: Map<string, unknown> }).circuits.clear();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (attachmentIds.length) {
      await cdcDb.delete(activitiesTable).where(inArray(activitiesTable.subjectId, attachmentIds));
      await cdcDb.delete(attachmentsTable).where(inArray(attachmentsTable.id, attachmentIds));
    }
    await cdcDb.execute(sql`DELETE FROM channel_counters WHERE channel_key = ${organizationId}`);
    await cdcDb.delete(organizationsTable).where(eq(organizationsTable.id, organizationId));
    await cdcDb.execute(sql`DELETE FROM tenants WHERE id = ${tenantId}`);
  });

  /** A next LSN: activity ids derive from it, so one LSN is one event. */
  const nextLsn = () => `0/${(lsnCounter++).toString(16).toUpperCase()}`;

  const insertAttachment = async (): Promise<string> => {
    const id = generateId();
    attachmentIds.push(id);
    await cdcDb.insert(attachmentsTable).values({
      ...mockAttachment(`flush:${id}`),
      id,
      tenantId,
      organizationId,
      ...Object.fromEntries(hierarchy.getNullableAncestors('attachment').map((type) => [appConfig.entityIdColumnKeys[type], null])),
      createdBy: null,
      updatedBy: null,
      deletedBy: null,
      seq: 0,
    });
    return id;
  };

  /** The row as pgoutput delivers it: snake_case columns. */
  const storedRow = async (id: string) => (await cdcDb.execute(sql`SELECT * FROM attachments WHERE id = ${id}`)).rows[0] as Record<string, unknown>;

  const eventFor = async (tag: 'insert' | 'update', id: string, lsn: string, oldRow?: Record<string, unknown>): Promise<PendingEvent> => {
    const result = parseMessage(dmlMessage(tag, 'attachments', await storedRow(id), oldRow));
    if (!result) throw new Error(`The parser dropped the ${tag} of ${id}`);
    // The transaction buffer stamps an activity with its transaction's commit time: the same on every delivery.
    const committed = committedAt.get(lsn) ?? new Date().toISOString();
    committedAt.set(lsn, committed);
    result.activity.createdAt = committed;
    return { lsn, result };
  };

  const counts = async () =>
    ((await cdcDb.execute(sql`SELECT counts FROM channel_counters WHERE channel_key = ${organizationId}`)).rows[0]?.counts ?? {}) as Record<
      string,
      number
    >;

  const activitiesOf = async (ids: string[]) =>
    (await cdcDb.select({ id: activitiesTable.id }).from(activitiesTable).where(inArray(activitiesTable.subjectId, ids))).length;

  const seqOf = async (id: string) => Number((await storedRow(id)).seq);

  it('records an event once however often it is delivered, and notifies each time', async () => {
    const [first, second] = [await insertAttachment(), await insertAttachment()];
    const lsns = [nextLsn(), nextLsn()];
    const delivery = async () => [[await eventFor('insert', first, lsns[0])], [await eventFor('insert', second, lsns[1])]];
    const before = await counts();

    await processFlush(await delivery());

    const recorded = await counts();
    expect(await activitiesOf([first, second])).toBe(2);
    expect(recorded['e:c:attachment']).toBe((before['e:c:attachment'] ?? 0) + 2);
    expect(recorded.sequence).toBe((before.sequence ?? 0) + 2);
    // Commit order is sequence order.
    expect(await seqOf(second)).toBe((await seqOf(first)) + 1);
    const notified = dispatched.flatMap((message) => message.batchRows?.map((row) => row.seq) ?? [message.seq]);
    expect(notified).toEqual([recorded.sequence - 1, recorded.sequence]);

    // The same events again, as after a restart that read from an unconfirmed position.
    dispatched = [];
    await processFlush(await delivery());

    expect(await activitiesOf([first, second])).toBe(2);
    expect(await counts()).toEqual(recorded);
    expect(await seqOf(second)).toBe(recorded.sequence);
    // The API is told again, with the positions the rows already hold: a notification is safe to repeat.
    expect(dispatched.flatMap((message) => message.batchRows?.map((row) => row.seq) ?? [message.seq])).toEqual([
      recorded.sequence - 1,
      recorded.sequence,
    ]);
  });

  it('stamps a row created and edited in one flush with its last position', async () => {
    const id = await insertAttachment();
    const created = await eventFor('insert', id, nextLsn());
    const oldRow = await storedRow(id);
    await cdcDb.execute(sql`
      UPDATE attachments SET name = 'renamed', updated_at = now(), stx = jsonb_set(stx, '{changedFields}', '["name", "updatedAt"]')
      WHERE id = ${id}
    `);
    const edited = await eventFor('update', id, nextLsn(), oldRow);
    const before = await counts();

    // Two source transactions, flushed together: the create comes first in the log.
    await processFlush([[created], [edited]]);

    const recorded = await counts();
    expect(recorded.sequence).toBe((before.sequence ?? 0) + 2);
    expect(recorded['e:c:attachment']).toBe((before['e:c:attachment'] ?? 0) + 1);
    expect(await seqOf(id)).toBe(recorded.sequence);
    expect(created.result.rowData.seq).toBe(recorded.sequence - 1);
    expect(edited.result.rowData.seq).toBe(recorded.sequence);
  });

  it('records nothing of a source transaction that fails, and counts the failure against its table', async () => {
    const [good, bad] = [await insertAttachment(), await insertAttachment()];
    const goodEvent = await eventFor('insert', good, nextLsn());
    const badEvent = await eventFor('insert', bad, nextLsn());
    // A product row without an organization cannot be given a sequence position.
    badEvent.result.activity.organizationId = null;
    const before = await counts();

    await expect(processFlush([[goodEvent], [badEvent]])).rejects.toThrow('No organization');

    // The flush is repeated one source transaction at a time: the first one is recorded, the failing one not at all.
    const recorded = await counts();
    expect(await activitiesOf([good])).toBe(1);
    expect(await activitiesOf([bad])).toBe(0);
    expect(recorded['e:c:attachment']).toBe((before['e:c:attachment'] ?? 0) + 1);
    expect(await seqOf(bad)).toBe(0);

    // Delivered again after the restart: still rejected, and the good event is not counted twice.
    await expect(processFlush([[goodEvent], [badEvent]])).rejects.toThrow('No organization');
    expect(await counts()).toEqual(recorded);
  });

  it('lets the stream pass once the circuit of a failing table is open', async () => {
    const [good, bad] = [await insertAttachment(), await insertAttachment()];
    const badEvent = await eventFor('insert', bad, nextLsn());
    badEvent.result.activity.organizationId = null;
    // The failing transaction is of another table, as far as the breaker is concerned.
    badEvent.result.activity.tableName = 'flush_test_poison';

    for (let attempt = 0; attempt < 3; attempt++) await expect(processFlush([[badEvent]])).rejects.toThrow();

    const goodEvent = await eventFor('insert', good, nextLsn());
    await processFlush([[badEvent], [goodEvent]]);

    expect(await activitiesOf([good])).toBe(1);
    expect(await activitiesOf([bad])).toBe(0);
  });

  it('records a source transaction larger than one statement takes', async () => {
    const id = await insertAttachment();
    const template = await eventFor('insert', id, nextLsn());
    // 2,500 events of one row: more than one chunk of activity rows, one row to stamp.
    const events: PendingEvent[] = Array.from({ length: 2500 }, () => ({
      lsn: nextLsn(),
      result: { ...template.result, activity: { ...template.result.activity }, rowData: { ...template.result.rowData } },
    }));
    const before = await counts();

    await processFlush([events]);

    expect(await activitiesOf([id])).toBe(2500);
    expect((await counts()).sequence).toBe((before.sequence ?? 0) + 2500);
    expect(await seqOf(id)).toBe((before.sequence ?? 0) + 2500);
  });
});
