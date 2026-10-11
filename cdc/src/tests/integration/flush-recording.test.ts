import { eq, inArray, sql } from 'drizzle-orm';
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
import { ApiUnreachableError } from '../../services/failure';
import type { PendingEvent } from '../../types';
import { dmlMessage } from '../factories';
import { type AttachmentHome, seedAttachmentHome } from './pipeline-harness';

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
  let home: AttachmentHome;
  let lsnCounter = 0x1000;
  const committedAt = new Map<string, string>();
  /** What the worker sent to the API: the subject of each message, and the sequence value of each of its rows. */
  let dispatched: { subjectId: string | null; seqs: (number | undefined)[] }[] = [];

  beforeAll(async () => {
    await cdcDb.execute(sql`INSERT INTO tenants (id, name) VALUES (${tenantId}, ${`flush-${tenantId}`})`);
    await cdcDb
      .insert(organizationsTable)
      .values({ ...mockOrganization(), id: organizationId, tenantId, slug: `flush-${tenantId}`, createdBy: null });
    home = await seedAttachmentHome({ id: organizationId, tenantId });
    // No API in this test: the socket counts as open, and what the worker sends is collected.
    vi.spyOn(wsClient, 'whenConnected').mockResolvedValue();
    vi.spyOn(wsClient, 'send');
  });

  beforeEach(() => {
    dispatched = [];
    vi.mocked(wsClient.send).mockImplementation((payload: unknown) => {
      const { activity, rows = [] } = payload as { activity?: { subjectId: string | null }; rows?: { seq?: number }[] };
      if (activity) dispatched.push({ subjectId: activity.subjectId, seqs: rows.map((row) => row.seq) });
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (attachmentIds.length) {
      await cdcDb.delete(activitiesTable).where(inArray(activitiesTable.subjectId, attachmentIds));
      await cdcDb.delete(attachmentsTable).where(inArray(attachmentsTable.id, attachmentIds));
    }
    await home.remove();
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
      ...home.columns,
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
    const notified = dispatched.flatMap((message) => message.seqs);
    expect(notified).toEqual([recorded.sequence - 1, recorded.sequence]);

    // The same events again, as after a restart that read from an unacknowledged position.
    dispatched = [];
    await processFlush(await delivery());

    expect(await activitiesOf([first, second])).toBe(2);
    expect(await counts()).toEqual(recorded);
    expect(await seqOf(second)).toBe(recorded.sequence);
    // The API is told again, with the positions the rows already hold: a notification is safe to repeat.
    expect(dispatched.flatMap((message) => message.seqs)).toEqual([recorded.sequence - 1, recorded.sequence]);
  });

  it('records every row of one WAL record, which share an LSN', async () => {
    const [first, second, third] = [await insertAttachment(), await insertAttachment(), await insertAttachment()];
    const lsn = nextLsn();
    // A COPY writes a page of rows in one record: their index in the transaction is what tells their events apart.
    const commitLsn = nextLsn();
    const delivery = async () => [
      await Promise.all([first, second, third].map(async (id, index) => ({ ...(await eventFor('insert', id, lsn)), commitLsn, index }))),
    ];
    const before = await counts();

    await processFlush(await delivery());

    const recorded = await counts();
    expect(await activitiesOf([first, second, third])).toBe(3);
    expect(recorded['e:c:attachment']).toBe((before['e:c:attachment'] ?? 0) + 3);
    expect([await seqOf(first), await seqOf(second), await seqOf(third)]).toEqual([recorded.sequence - 2, recorded.sequence - 1, recorded.sequence]);

    await processFlush(await delivery());

    expect(await activitiesOf([first, second, third])).toBe(3);
    expect(await counts()).toEqual(recorded);
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

  it('records nothing of a flush that fails, and nothing twice when it is read again', async () => {
    const [good, bad] = [await insertAttachment(), await insertAttachment()];
    const goodEvent = await eventFor('insert', good, nextLsn());
    const badEvent = await eventFor('insert', bad, nextLsn());
    // A product row without an organization cannot be given a sequence position.
    badEvent.result.activity.organizationId = null;
    const before = await counts();

    await expect(processFlush([[goodEvent], [badEvent]])).rejects.toThrow('No organization');

    // One transaction for the whole flush: the good change waits with the one that failed.
    expect(await activitiesOf([good, bad])).toBe(0);
    expect(await counts()).toEqual(before);
    expect(await seqOf(good)).toBe(0);
    expect(dispatched).toEqual([]);

    // Read again, still failing: nothing changes however often.
    await expect(processFlush([[goodEvent], [badEvent]])).rejects.toThrow('No organization');
    expect(await counts()).toEqual(before);

    // Once the cause is gone the same events are recorded, once.
    badEvent.result.activity.organizationId = organizationId;
    await processFlush([[goodEvent], [badEvent]]);

    const recorded = await counts();
    expect(await activitiesOf([good, bad])).toBe(2);
    expect(recorded['e:c:attachment']).toBe((before['e:c:attachment'] ?? 0) + 2);
  });

  it('rejects a flush the API did not take, after recording it, and hands it over when it is read again', async () => {
    const id = await insertAttachment();
    const event = await eventFor('insert', id, nextLsn());
    const before = await counts();
    vi.mocked(wsClient.send).mockImplementationOnce(() => {
      throw new ApiUnreachableError();
    });

    await expect(processFlush([[event]])).rejects.toThrow('The API is not reachable');

    const recorded = await counts();
    expect(await activitiesOf([id])).toBe(1);

    // The stream is read again from the unacknowledged position: recorded once, handed over now.
    await processFlush([[event]]);

    expect(await counts()).toEqual(recorded);
    expect(recorded['e:c:attachment']).toBe((before['e:c:attachment'] ?? 0) + 1);
    expect(dispatched.map((message) => message.subjectId)).toEqual([id]);
  });

  it('hands rows that are no product to the API one at a time, in commit order', async () => {
    const [firstTenant, secondTenant] = [nanoidTenant(), nanoidTenant()];
    for (const id of [firstTenant, secondTenant]) await cdcDb.execute(sql`INSERT INTO tenants (id, name) VALUES (${id}, ${`order-${id}`})`);
    const tenantEvent = async (tag: 'insert' | 'update', id: string): Promise<PendingEvent> => {
      const row = (await cdcDb.execute(sql`SELECT * FROM tenants WHERE id = ${id}`)).rows[0] as Record<string, unknown>;
      // An update without a changed column is no event: the old row carries another name.
      const result = parseMessage(dmlMessage(tag, 'tenants', row, tag === 'update' ? { ...row, name: 'before' } : undefined));
      if (!result) throw new Error(`The parser dropped the ${tag} of tenant ${id}`);
      return { lsn: nextLsn(), result };
    };

    try {
      // One flush: the first tenant is updated, then the second is created and updated. Sent per type and action,
      // the second tenant's update would reach the API before its create.
      const events = [await tenantEvent('update', firstTenant), await tenantEvent('insert', secondTenant), await tenantEvent('update', secondTenant)];
      const sent: { type: string; subjectId: string | null; rowId: unknown }[] = [];
      vi.mocked(wsClient.send).mockImplementation((payload: unknown) => {
        const { activity, rowData } = payload as { activity: { type: string; subjectId: string | null }; rowData?: { id: string } };
        sent.push({ type: activity.type, subjectId: activity.subjectId, rowId: rowData?.id });
      });

      await processFlush(events.map((event) => [event]));

      // Each message carries its one whole row.
      expect(sent).toEqual([
        { type: 'tenant.updated', subjectId: firstTenant, rowId: firstTenant },
        { type: 'tenant.created', subjectId: secondTenant, rowId: secondTenant },
        { type: 'tenant.updated', subjectId: secondTenant, rowId: secondTenant },
      ]);
    } finally {
      await cdcDb.execute(sql`DELETE FROM activities WHERE subject_id IN (${firstTenant}, ${secondTenant})`);
      await cdcDb.execute(sql`DELETE FROM tenants WHERE id IN (${firstTenant}, ${secondTenant})`);
    }
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
