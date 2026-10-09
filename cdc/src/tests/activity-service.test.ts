import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockCdcActivity, mockProductRow } from './factories';

vi.mock('../network/websocket-client', () => ({ wsClient: { send: vi.fn() } }));
vi.mock('shared/utils/nanoid', () => ({ nanoid: () => 'mock-token', nanoidTenant: () => 'mock-t' }));

import { wsClient } from '../network/websocket-client';
import { generateActivityId, sendMessageToApi, sendProductMessagesToApi } from '../services/activity-service';

describe('generateActivityId', () => {
  const idOf = (commitLsn: string, index = 0) => generateActivityId({ lsn: '0/1', commitLsn, index });

  it('joins the padded commit position and the padded index into a fixed 26-char id', () => {
    expect(idOf('0/16B3748')).toBe('00000000-016B3748-00000000');
    expect(idOf('0/16B3748', 12)).toBe('00000000-016B3748-00000012');
    expect(idOf('1/0', 3)).toHaveLength(26);
  });

  it('is the same on every delivery, for idempotent replay', () => {
    expect(idOf('A/FF', 4)).toBe(idOf('A/FF', 4));
  });

  it('tells the changes of one transaction apart, also the rows of one WAL record, which share an LSN', () => {
    const rows = [0, 1, 2, 11].map((index) => generateActivityId({ lsn: '0/50', commitLsn: '0/90', index }));

    expect(new Set(rows).size).toBe(4);
    expect([...rows].sort()).toEqual(rows);
  });

  it('sorts in commit order, whatever the positions of the changes themselves', () => {
    // A long transaction wrote first (0/10) and committed last (0/200); a short one wrote later and committed first.
    const long = generateActivityId({ lsn: '0/10', commitLsn: '0/200', index: 0 });
    const short = generateActivityId({ lsn: '0/50', commitLsn: '0/9F', index: 7 });

    expect(short < long).toBe(true);
  });

  it('sorts correctly across digit-width changes and a 32-bit segment rollover', () => {
    expect(idOf('0/9F') < idOf('0/100')).toBe(true);
    expect(idOf('0/FFFFFFFF', 99) < idOf('1/00000000')).toBe(true);
  });

  it('takes the position of the change itself for an event outside a transaction', () => {
    expect(generateActivityId({ lsn: '0/16B3748' })).toBe('00000000-016B3748-00000000');
  });
});

describe('sendProductMessagesToApi', () => {
  type SentRow = { seq?: number; rowData: Record<string, unknown>; movedFrom?: Record<string, unknown> };
  type Sent = { activity: Record<string, unknown>; rows: SentRow[] };

  const trace = { traceId: 'test', spanId: 'test' } as never;
  const sent = () => vi.mocked(wsClient.send).mock.calls.map((call) => call[0] as Sent);
  const inOrg = (organizationId: string, seq: number, extra: Record<string, unknown> = {}) => mockProductRow(seq, { organizationId, ...extra });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the rows of one audience as one message, each row with its own seq', () => {
    // Sequence values of one audience need not be contiguous: another audience may hold 11.
    sendProductMessagesToApi('attachment', [inOrg('org-a', 10), inOrg('org-a', 12), inOrg('org-a', 13)], trace);

    expect(wsClient.send).toHaveBeenCalledOnce();
    expect(sent()[0].rows.map((row) => row.seq)).toEqual([10, 12, 13]);
  });

  it('must not carry a range or a count: the API derives them from the rows', () => {
    sendProductMessagesToApi('attachment', [inOrg('org-a', 10), inOrg('org-a', 12)], trace);

    const [message] = sent();
    expect(message.activity).not.toHaveProperty('seq');
    expect(message.activity).not.toHaveProperty('batchUntilSeq');
    expect(message.activity).not.toHaveProperty('count');
    // One shape: no whole row beside the list, and no second list.
    expect(message).not.toHaveProperty('rowData');
    expect(message).not.toHaveProperty('batchRows');
  });

  it('splits the rows of two audiences into one message each, whatever their order', () => {
    // Interleaved on purpose: grouping must not depend on input order.
    const rows = [inOrg('org-a', 10), inOrg('org-b', 5), inOrg('org-a', 11), inOrg('org-b', 6), inOrg('org-b', 7)];
    sendProductMessagesToApi('attachment', rows, trace);

    expect(wsClient.send).toHaveBeenCalledTimes(2);
    const orgA = sent().find((message) => message.rows[0].rowData.organizationId === 'org-a');
    const orgB = sent().find((message) => message.rows[0].rowData.organizationId === 'org-b');
    // Each message speaks only for its own audience's rows.
    expect(orgA?.rows.map((row) => row.seq)).toEqual([10, 11]);
    expect(orgB?.rows.map((row) => row.seq)).toEqual([5, 6, 7]);
  });

  it("sends an audience of one row with that row's activity, so the tab that wrote it knows its own write", () => {
    const stx = { mutationId: 'mut-1', sourceId: 'tab-a', fieldTimestamps: {} };
    const alone = inOrg('org-a', 10);
    alone.activity = { ...alone.activity, stx };
    // One flush, two organizations: org-a has one edit, org-b two.
    sendProductMessagesToApi('attachment', [alone, inOrg('org-b', 5), inOrg('org-b', 6)], trace);

    const single = sent().find((message) => message.rows[0].rowData.organizationId === 'org-a');
    const together = sent().find((message) => message.rows[0].rowData.organizationId === 'org-b');
    // The same shape as any other message, with one row: the API gives its notification that row's seq and this stx.
    expect(single?.rows).toEqual([{ seq: 10, rowData: { id: 'entity-10', organizationId: 'org-a' } }]);
    expect(single?.activity).toMatchObject({ id: 'act-10', subjectId: 'entity-10', stx });
    // Positive control: two rows for one audience share a message, under the first row's activity.
    expect(together?.rows.map((row) => row.seq)).toEqual([5, 6]);
    expect(together?.activity).toMatchObject({ id: 'act-5', subjectId: 'entity-5' });
  });

  it('must not send the content of a row, of one row or of several', () => {
    const content = { createdBy: 'u1', publicAt: null, name: 'secret', description: 'body', filename: 'secret.png' };
    sendProductMessagesToApi('attachment', [inOrg('org-a', 10, content), inOrg('org-b', 11, content), inOrg('org-b', 12)], trace);

    const permissionFields = (seq: number, organizationId: string) => ({ id: `entity-${seq}`, organizationId, createdBy: 'u1', publicAt: null });
    // Ids, the author and the columns a permission reads stay; names and bodies never reach the wire.
    expect(sent().map((message) => message.rows[0].rowData)).toEqual([permissionFields(10, 'org-a'), permissionFields(11, 'org-b')]);
    expect(JSON.stringify(sent())).not.toContain('secret');
  });

  it('carries where a moved row was on that row alone', () => {
    const moved = { ...inOrg('org-b', 11), movedFrom: { id: 'entity-11', organizationId: 'org-a' } };
    sendProductMessagesToApi('attachment', [inOrg('org-b', 10), moved], trace);

    expect(sent()[0].rows).toEqual([
      { seq: 10, rowData: { id: 'entity-10', organizationId: 'org-b' } },
      { seq: 11, rowData: { id: 'entity-11', organizationId: 'org-b' }, movedFrom: { id: 'entity-11', organizationId: 'org-a' } },
    ]);
  });

  it('sends deleted rows, which hold no seq', () => {
    const rows = [inOrg('org-a', 1), inOrg('org-a', 2)].map((row) => ({
      ...row,
      seq: undefined,
      activity: { ...row.activity, action: 'delete' as const },
    }));

    sendProductMessagesToApi('attachment', rows, trace);

    expect(wsClient.send).toHaveBeenCalledOnce();
    const [message] = sent();
    expect(message.activity.action).toBe('delete');
    expect(message.rows.map((row) => row.rowData.id)).toEqual(['entity-1', 'entity-2']);
    expect(message.rows.every((row) => row.seq === undefined)).toBe(true);
  });
});

describe('sendMessageToApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends a row that is no product whole, without a list of rows', () => {
    const membership = { id: 'mem-1', userId: 'user-9', organizationId: 'org-a', role: 'member', channelType: 'organization' };
    const activity = mockCdcActivity({ entityType: null, resourceType: 'membership', subjectId: 'mem-1' });

    sendMessageToApi(activity, membership, { traceId: 'test', spanId: 'test' } as never);

    const [message] = vi.mocked(wsClient.send).mock.calls[0] as [Record<string, unknown>];
    expect(message.rowData).toEqual(membership);
    expect(message).not.toHaveProperty('rows');
    expect(message).not.toHaveProperty('movedFrom');
  });
});
