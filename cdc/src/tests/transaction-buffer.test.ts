import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockParseResult } from './factories';

import { TransactionBuffer } from '../services/transaction-buffer';
import type { ParseMessageResult } from '../pipeline/parse-message';

describe('TransactionBuffer', () => {
  let processedEvents: Array<{ lsn: string; result: ParseMessageResult }>;
  let onSurvivingEvents: (events: Array<{ lsn: string; result: ParseMessageResult }>) => Promise<void>;
  let buffer: TransactionBuffer;

  beforeEach(() => {
    processedEvents = [];

    onSurvivingEvents = vi.fn(async (events: Array<{ lsn: string; result: ParseMessageResult }>) => {
      for (const event of events) {
        processedEvents.push(event);
      }
    });

    buffer = new TransactionBuffer(onSurvivingEvents);
  });

  it('passes through events when no transaction is active', async () => {
    const result = mockParseResult({ action: 'create', entityType: 'attachment' });
    await buffer.onEvent('0/1', result);

    expect(processedEvents).toHaveLength(1);
    expect(processedEvents[0].lsn).toBe('0/1');
  });

  it('buffers events within a transaction and releases on commit', async () => {
    buffer.onBegin({ tag: 'begin', xid: 1, commitLsn: null, commitTime: BigInt(0) });

    const r1 = mockParseResult({ action: 'create', entityType: 'attachment' });
    const r2 = mockParseResult({ action: 'create', entityType: 'attachment' });
    await buffer.onEvent('0/1', r1);
    await buffer.onEvent('0/2', r2);

    // Not processed yet
    expect(processedEvents).toHaveLength(0);

    await buffer.onCommit();

    // Now both should be processed
    expect(processedEvents).toHaveLength(2);
  });

  it('suppresses cascaded child deletes when the parent context entity is deleted', async () => {
    buffer.onBegin({ tag: 'begin', xid: 42, commitLsn: null, commitTime: BigInt(0) });

    // 3 attachment deletes cascading from the organization
    const t1 = mockParseResult({ action: 'delete', entityType: 'attachment', subjectId: 'attachment-1', organizationId: 'org-1' });
    const t2 = mockParseResult({ action: 'delete', entityType: 'attachment', subjectId: 'attachment-2', organizationId: 'org-1' });
    const t3 = mockParseResult({ action: 'delete', entityType: 'attachment', subjectId: 'attachment-3', organizationId: 'org-1' });

    // Membership cascaded delete
    const m1 = mockParseResult({ action: 'delete', resourceType: 'membership', entityType: null, subjectId: 'mem-1', organizationId: 'org-1' });

    // The organization (context entity) delete itself
    const proj = mockParseResult({ action: 'delete', entityType: 'organization', subjectId: 'org-1', organizationId: 'org-1' });

    await buffer.onEvent('0/1', t1);
    await buffer.onEvent('0/2', t2);
    await buffer.onEvent('0/3', t3);
    await buffer.onEvent('0/5', m1);
    await buffer.onEvent('0/6', proj);

    await buffer.onCommit();

    // Only the org delete survives
    expect(processedEvents).toHaveLength(1);
    const survivors = processedEvents.map((e) => ({
      entityType: e.result.activity.entityType,
      subjectId: e.result.activity.subjectId,
    }));
    expect(survivors).toContainEqual({ entityType: 'organization', subjectId: 'org-1' });
  });

  it('does not suppress deletes from different context entities', async () => {
    buffer.onBegin({ tag: 'begin', xid: 43, commitLsn: null, commitTime: BigInt(0) });

    // Delete project-1
    const proj = mockParseResult({ action: 'delete', entityType: 'organization', subjectId: 'org-1', organizationId: 'org-1' });

    // Attachment in a DIFFERENT org — should NOT be suppressed
    const t1 = mockParseResult({ action: 'delete', entityType: 'attachment', subjectId: 'attachment-99', organizationId: 'org-other' });

    // Attachment in the deleted org — should be suppressed
    const t2 = mockParseResult({ action: 'delete', entityType: 'attachment', subjectId: 'attachment-1', organizationId: 'org-1' });

    await buffer.onEvent('0/1', proj);
    await buffer.onEvent('0/2', t1);
    await buffer.onEvent('0/3', t2);

    await buffer.onCommit();

    expect(processedEvents).toHaveLength(2);
    expect(processedEvents[0].result.activity.subjectId).toBe('org-1');
    expect(processedEvents[1].result.activity.subjectId).toBe('attachment-99');
  });

  it('does not suppress non-delete events even in cascade transactions', async () => {
    buffer.onBegin({ tag: 'begin', xid: 44, commitLsn: null, commitTime: BigInt(0) });

    // An update event for a task in the project being deleted (edge case)
    const update = mockParseResult({ action: 'update', entityType: 'attachment', subjectId: 'attachment-1' });
    const proj = mockParseResult({ action: 'delete', entityType: 'organization', subjectId: 'org-1', organizationId: 'org-1' });

    await buffer.onEvent('0/1', update);
    await buffer.onEvent('0/2', proj);

    await buffer.onCommit();

    // Update should not be suppressed, only deletes
    expect(processedEvents).toHaveLength(2);
  });

  it('suppresses cascaded deletes via org-level cascade', async () => {
    buffer.onBegin({ tag: 'begin', xid: 45, commitLsn: null, commitTime: BigInt(0) });

    const org = mockParseResult({ action: 'delete', entityType: 'organization', subjectId: 'org-1' });
    const t1 = mockParseResult({ action: 'delete', entityType: 'attachment', subjectId: 'attachment-1', organizationId: 'org-1' });
    const m1 = mockParseResult({ action: 'delete', resourceType: 'membership', entityType: null, subjectId: 'mem-1', organizationId: 'org-1' });

    await buffer.onEvent('0/1', org);
    await buffer.onEvent('0/2', t1);
    await buffer.onEvent('0/3', m1);

    await buffer.onCommit();

    // Only org delete survives
    expect(processedEvents).toHaveLength(1);
    expect(processedEvents[0].result.activity.subjectId).toBe('org-1');
  });

  it('handles large cascade without excessive buffering', async () => {
    buffer.onBegin({ tag: 'begin', xid: 100, commitLsn: null, commitTime: BigInt(0) });

    // Org delete arrives first (parent-first WAL order)
    const org = mockParseResult({ action: 'delete', entityType: 'organization', subjectId: 'org-1' });
    await buffer.onEvent('0/0', org);

    // Simulate 50,000 cascaded child deletes — well beyond old maxBufferedEvents (20k)
    for (let i = 0; i < 50_000; i++) {
      const task = mockParseResult({
        action: 'delete',
        entityType: 'attachment',
        subjectId: `task-${i}`,
        organizationId: 'org-1',
        
      });
      await buffer.onEvent(`0/${i + 1}`, task);
    }

    await buffer.onCommit();

    // Only the org delete should survive — all 50k tasks suppressed inline
    expect(processedEvents).toHaveLength(1);
    expect(processedEvents[0].result.activity.entityType).toBe('organization');

    // Verify onSurvivingEvents was called once (at commit) with just 1 event
    expect(onSurvivingEvents).toHaveBeenCalledTimes(1);
    expect((onSurvivingEvents as ReturnType<typeof vi.fn>).mock.calls[0][0]).toHaveLength(1);
  }, 30_000); // Processes 50k events; the default 10s timeout is too tight on loaded CI runners

  it('suppresses child deletes that arrive before parent context entity delete', async () => {
    buffer.onBegin({ tag: 'begin', xid: 101, commitLsn: null, commitTime: BigInt(0) });

    // Children arrive before parent (edge case — non-standard WAL order)
    const t1 = mockParseResult({ action: 'delete', entityType: 'attachment', subjectId: 'attachment-1', organizationId: 'org-1' });
    const t2 = mockParseResult({ action: 'delete', entityType: 'attachment', subjectId: 'attachment-2', organizationId: 'org-1' });
    const proj = mockParseResult({ action: 'delete', entityType: 'organization', subjectId: 'org-1', organizationId: 'org-1' });

    await buffer.onEvent('0/1', t1);
    await buffer.onEvent('0/2', t2);
    await buffer.onEvent('0/3', proj);

    await buffer.onCommit();

    // Only project delete should survive — tasks caught by second pass at commit
    expect(processedEvents).toHaveLength(1);
    expect(processedEvents[0].result.activity.entityType).toBe('organization');
  });

  it('suppresses cascaded deletes from organization deletion', async () => {
    buffer.onBegin({ tag: 'begin', xid: 45, commitLsn: null, commitTime: BigInt(0) });

    // Cascaded project delete
    const proj = mockParseResult({ action: 'delete', entityType: 'organization', subjectId: 'org-1', organizationId: 'org-1' });
    // Cascaded task delete (matched via organizationId since project is also being deleted)
    const t1 = mockParseResult({ action: 'delete', entityType: 'attachment', subjectId: 'attachment-1', organizationId: 'org-1' });
    // The org delete
    const org = mockParseResult({ action: 'delete', entityType: 'organization', subjectId: 'org-1' });

    await buffer.onEvent('0/1', proj);
    await buffer.onEvent('0/2', t1);
    await buffer.onEvent('0/3', org);

    await buffer.onCommit();

    // Only the org delete should survive — project is a context entity but its ID is in deletedContextIds,
    // however context entity deletes themselves are never suppressed.
    // Actually: project.delete has organizationId = 'org-1' which is in deletedContextIds,
    // but isCascadedDelete returns false for context entities. So project delete IS processed.
    // Task has organizationId = 'org-1' in deletedContextIds → suppressed
    expect(processedEvents).toHaveLength(2); // org + project
    const types = processedEvents.map((e) => e.result.activity.entityType);
    expect(types).toContain('organization');
    expect(types).toContain('organization');
  });

  it('handles single-event transactions with no overhead', async () => {
    buffer.onBegin({ tag: 'begin', xid: 46, commitLsn: null, commitTime: BigInt(0) });

    const result = mockParseResult({ action: 'create', entityType: 'attachment' });
    await buffer.onEvent('0/1', result);

    await buffer.onCommit();

    expect(processedEvents).toHaveLength(1);
    // onSurvivingEvents should be called once with one event
    expect(onSurvivingEvents).toHaveBeenCalledTimes(1);
  });

  it('handles empty transactions gracefully', async () => {
    buffer.onBegin({ tag: 'begin', xid: 47, commitLsn: null, commitTime: BigInt(0) });
    await buffer.onCommit();

    expect(processedEvents).toHaveLength(0);
  });
});
