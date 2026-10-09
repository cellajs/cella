import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { type ActivityEvent, activityBus } from '#/lib/activity-bus';
import { type CdcWorkerHealth, cdcWebSocketServer } from '#/lib/cdc-websocket';
import { productCache } from '#/middlewares/product-cache/app-product-cache';
import { mockActivity } from '#/modules/activities/activities-mocks';
import { log } from '#/utils/logger';

/** A worker socket as the socket server uses one: it registers handlers and may be closed. The test fires the handlers. */
const fakeSocket = () => {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const close = vi.fn();
  const on = (event: string, handler: (...args: unknown[]) => void) => {
    handlers[event] = handler;
  };
  return {
    socket: { on, close },
    close,
    send: (message: unknown) => handlers.message(Buffer.from(JSON.stringify(message))),
    fireClose: () => handlers.close(1006, Buffer.from('')),
    fireError: () => handlers.error(new Error('socket hang up')),
  };
};

/** Hands a socket to the socket server where an accepted upgrade does. */
const connect = () => {
  const worker = fakeSocket();
  // A test double and a private entry: `accept` needs a real HTTP upgrade to get here.
  (cdcWebSocketServer as unknown as { handleConnection: (ws: WebSocket) => void }).handleConnection(worker.socket as unknown as WebSocket);
  return worker;
};

const healthReport = (overrides: Partial<CdcWorkerHealth> = {}) => ({
  _control: 'health',
  payload: { status: 'healthy', reasons: [], details: { replication: 'active' }, generation: 1, ...overrides } satisfies CdcWorkerHealth,
});

/** The activity of an attachment change as the worker records it. */
const attachmentActivity = (id: string, action: 'update' | 'delete' = 'delete') =>
  mockActivity(`cdc-socket:${id}`, {
    entityType: 'attachment',
    resourceType: null,
    action,
    type: `attachment.${action}d`,
    tableName: 'attachments',
    subjectId: id,
  });

/** A delete of attachments of one audience as the worker sends it: the first row's activity, and every row. */
const deleteMessage = (...ids: string[]) => ({ activity: attachmentActivity(ids[0]), rows: ids.map((id) => ({ rowData: { id } })) });

/** The events of one type that reached the bus while `act` ran. */
const onBus = (type: Parameters<typeof activityBus.on>[0], act: () => void): ActivityEvent[] => {
  const seen: ActivityEvent[] = [];
  const listener = (event: ActivityEvent) => void seen.push(event);
  activityBus.on(type, listener);
  act();
  activityBus.off(type, listener);
  return seen;
};

/** The attachment deletes that reached the bus while `act` ran. */
const deletesOnBus = (act: () => void) => onBus('attachment.deleted', act);

afterEach(() => {
  cdcWebSocketServer.close();
  vi.useRealTimers();
});

describe('CDC socket: a connection that was replaced', () => {
  it('must not disconnect its replacement when the replaced connection closes', () => {
    const first = connect();
    const second = connect();
    expect(first.close).toHaveBeenCalledWith(1000, 'Replaced by new connection');
    second.send(healthReport());

    // The close of the first socket arrives once the second is live.
    first.fireClose();

    expect(cdcWebSocketServer.getHealthStatus().cdcConnected).toBe(true);
    expect(cdcWebSocketServer.getWorkerHealth()?.health).toMatchObject({ status: 'healthy' });
    expect(deletesOnBus(() => second.send(deleteMessage('att-live'))).map((event) => event.subjectId)).toEqual(['att-live']);
  });

  it('ignores an error and a message of the replaced connection', () => {
    const first = connect();
    const second = connect();
    second.send(healthReport());

    first.fireError();
    const fromReplaced = deletesOnBus(() => first.send(deleteMessage('att-late')));

    expect(fromReplaced).toEqual([]);
    expect(cdcWebSocketServer.getHealthStatus().cdcConnected).toBe(true);
    expect(cdcWebSocketServer.getWorkerHealth()?.health).not.toBeNull();
  });

  it('starts the replacement without the report of the replaced connection', () => {
    const first = connect();
    first.send(healthReport({ status: 'unhealthy', reasons: ['worker_stuck'] }));

    connect();

    expect(cdcWebSocketServer.getWorkerHealth()).toBeNull();
  });

  it('disconnects when the live connection closes (positive control)', () => {
    const worker = connect();
    worker.send(healthReport());

    worker.fireClose();

    expect(cdcWebSocketServer.getHealthStatus().cdcConnected).toBe(false);
    expect(cdcWebSocketServer.getWorkerHealth()).toBeNull();
  });
});

describe('CDC socket: a change drops the detail cache entry of its row', () => {
  const cached = (id: string) => productCache.get(`attachment:${id}`);

  beforeEach(() => {
    productCache.clear();
    for (const id of ['att-1', 'att-2', 'att-3', 'att-other']) productCache.set(`attachment:${id}`, { id }, performance.now());
  });

  it('drops the entry of a deleted row, with no listener on the bus', () => {
    const worker = connect();
    expect(cached('att-1')).toEqual({ id: 'att-1' });

    worker.send(deleteMessage('att-1'));

    expect(cached('att-1')).toBeUndefined();
    expect(cached('att-other')).toEqual({ id: 'att-other' });
  });

  it('drops the entry of every row of a delete of several rows', () => {
    const worker = connect();

    worker.send(deleteMessage('att-1', 'att-2', 'att-3'));

    for (const id of ['att-1', 'att-2', 'att-3']) expect(cached(id), id).toBeUndefined();
    expect(cached('att-other')).toEqual({ id: 'att-other' });
  });

  it('drops the entries of the rows of an older worker, sent alone or as `batchRows`', () => {
    const worker = connect();
    const batchRows = ['att-2', 'att-3'].map((id) => ({ rowData: { id } }));

    worker.send({ activity: attachmentActivity('att-1'), rowData: { id: 'att-1', name: 'gone' } });
    worker.send({ activity: { ...attachmentActivity('att-2'), count: 2 }, rowData: { id: 'att-2', name: 'gone' }, batchRows });

    for (const id of ['att-1', 'att-2', 'att-3']) expect(cached(id), id).toBeUndefined();
    expect(cached('att-other')).toEqual({ id: 'att-other' });
  });
});

describe('CDC socket: a message as the bus receives it', () => {
  const permissionFields = (id: string, organizationId = 'org-1') => ({
    id,
    organizationId,
    createdBy: 'user-1',
    publishedAt: '2026-07-01T00:00:00.000Z',
  });
  const updatesOnBus = (act: () => void) => onBus('attachment.updated', act);

  it('hands the rows of a product message to the bus as its list, with no whole row', () => {
    const worker = connect();
    const rows = [
      { seq: 12, rowData: permissionFields('att-1') },
      { seq: 14, rowData: permissionFields('att-2'), movedFrom: permissionFields('att-2', 'org-0') },
    ];

    const [event] = updatesOnBus(() => worker.send({ activity: attachmentActivity('att-1', 'update'), rows }));

    expect(event.rows).toEqual(rows);
    expect(event.rowData).toBeNull();
    expect(event.subjectId).toBe('att-1');
  });

  it('hands a row that is no product to the bus whole, without a list of rows', () => {
    const worker = connect();
    const membership = { id: 'mem-1', userId: 'user-1', channelType: 'organization', channelId: 'org-1', organizationId: 'org-1', role: 'member' };
    const activity = mockActivity('cdc-socket:mem-1', {
      entityType: null,
      resourceType: 'membership',
      action: 'create',
      type: 'membership.created',
      tableName: 'memberships',
      subjectId: 'mem-1',
    });

    const [event] = onBus('membership.created', () => worker.send({ activity, rowData: membership }));

    expect(event.rowData).toEqual(membership);
    expect(event.rows).toBeNull();
  });

  it('reads the one whole product row an older worker sends as a list of that row', () => {
    const worker = connect();
    const wholeRow = { ...permissionFields('att-1'), name: 'renamed', filename: 'a.png' };
    const movedFrom = permissionFields('att-1', 'org-0');

    const [event] = updatesOnBus(() =>
      worker.send({ activity: { ...attachmentActivity('att-1', 'update'), seq: 12 }, rowData: wholeRow, movedFrom }),
    );

    // The row's seq travelled on the activity and its old location beside the row.
    expect(event.rows).toEqual([{ seq: 12, rowData: wholeRow, movedFrom }]);
    expect(event.rowData).toBeNull();
  });

  it('reads the `batchRows` an older worker sends as the list of rows', () => {
    const worker = connect();
    const batchRows = [
      { seq: 12, rowData: permissionFields('att-1') },
      { seq: 14, rowData: permissionFields('att-2'), movedFrom: permissionFields('att-2', 'org-0') },
    ];
    const activity = { ...attachmentActivity('att-1', 'update'), seq: 12, batchUntilSeq: 14, count: 2 };

    const [event] = updatesOnBus(() => worker.send({ activity, rowData: { ...permissionFields('att-1'), name: 'first of two' }, batchRows }));

    // The same event a `rows` message of these rows gives: everything behind the socket reads the list alone.
    expect(event.rows).toEqual(batchRows);
    expect(event.rowData).toBeNull();
  });

  it('must not hand a product message without a row to the bus', () => {
    const worker = connect();
    const before = cdcWebSocketServer.getHealthStatus().parseErrors;

    const events = updatesOnBus(() => worker.send({ activity: attachmentActivity('att-1', 'update'), rows: [] }));

    expect(events).toEqual([]);
    expect(cdcWebSocketServer.getHealthStatus().parseErrors).toBe(before + 1);
  });
});

describe('CDC socket: control messages', () => {
  it('holds the report of a worker of another release as unreadable, and still follows its generation', () => {
    const worker = connect();
    const olderReport = (generation: number) => ({ _control: 'health', payload: { replicationStatus: 'active', lastLsn: null, generation } });

    worker.send(olderReport(41));
    expect(cdcWebSocketServer.getWorkerHealth()).toMatchObject({ health: null });
    const generations: number[] = [];
    cdcWebSocketServer.onGenerationChange((generation) => generations.push(generation));
    worker.send(olderReport(42));
    worker.send({ _control: 'health' });
    worker.send({ _control: 'health', payload: { status: 'fine', reasons: [], details: {}, generation: 42 } });

    expect(cdcWebSocketServer.getWorkerHealth()).toMatchObject({ health: null });
    expect(generations).toEqual([42]);
  });

  it('ignores a control message it does not know, without a warning or an error in the log', () => {
    const warn = vi.spyOn(log, 'warn');
    const error = vi.spyOn(log, 'error');
    const worker = connect();
    worker.send(healthReport({ status: 'degraded', reasons: ['wal_lag_high'] }));
    const before = cdcWebSocketServer.getHealthStatus();

    worker.send({ _control: 'wal_lag_alert', severity: 'wal_lag_warn', lagBytes: 2 ** 30 });

    expect(cdcWebSocketServer.getHealthStatus()).toEqual(before);
    expect(cdcWebSocketServer.getWorkerHealth()?.health).toMatchObject({ status: 'degraded', reasons: ['wal_lag_high'] });
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
  });
});

describe('CDC socket: liveness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('closes a connection that sent no message for 90 seconds', () => {
    const worker = connect();

    vi.advanceTimersByTime(89_999);
    expect(worker.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(worker.close).toHaveBeenCalledWith(1000, 'Idle timeout');
  });

  it("keeps a connection open on the worker's health report alone, one every 15 seconds", () => {
    const worker = connect();

    for (let elapsed = 0; elapsed < 5 * 60_000; elapsed += 15_000) {
      vi.advanceTimersByTime(15_000);
      worker.send(healthReport());
    }

    expect(worker.close).not.toHaveBeenCalled();
  });
});
