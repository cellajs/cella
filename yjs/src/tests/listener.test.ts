import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeLogNotice, YJS_LOG_CHANNEL } from '#/modules/yjs/helpers/yjs-log';
import { flushMicrotasks } from './helpers';

/** A pg.Client stand-in: `connect` and `LISTEN` succeed unless a test says otherwise, and the test drives its events. */
class FakeClient extends EventEmitter {
  connectError: Error | null = null;
  queries: string[] = [];
  ended = false;
  async connect() {
    if (this.connectError) throw this.connectError;
  }
  async query(text: string) {
    this.queries.push(text);
  }
  async end() {
    this.ended = true;
  }
  notify(channel: string, payload: string) {
    this.emit('notification', { channel, payload });
  }
}

const clients: FakeClient[] = [];
/** Failures the next clients' connects meet, in order. */
const connectErrors: (Error | null)[] = [];
vi.mock('../data/db', () => ({
  createListenerClient: () => {
    const client = new FakeClient();
    client.connectError = connectErrors.shift() ?? null;
    clients.push(client);
    return client;
  },
}));

const { logListenerStatus, startLogListener, stopLogListener } = await import('../data/listener');

const onNotice = vi.fn();
const onListening = vi.fn();
const notice = { tenantId: 'tenant-1', entityType: 'task', entityId: 'entity-1', logIds: [7] };

beforeEach(() => {
  vi.useFakeTimers();
  clients.length = 0;
  connectErrors.length = 0;
  onNotice.mockClear();
  onListening.mockClear();
});

afterEach(async () => {
  await stopLogListener();
  vi.useRealTimers();
});

describe('log listener', () => {
  it('listens on the log channel on its own connection and hands each notice over', async () => {
    startLogListener(onNotice, onListening);
    expect(logListenerStatus()).toBe('connecting');
    await flushMicrotasks();

    expect(clients).toHaveLength(1);
    expect(clients[0].queries).toEqual([`LISTEN ${YJS_LOG_CHANNEL}`]);
    expect(logListenerStatus()).toBe('listening');
    expect(onListening).toHaveBeenCalledTimes(1);

    clients[0].notify(YJS_LOG_CHANNEL, encodeLogNotice(notice));
    expect(onNotice).toHaveBeenCalledExactlyOnceWith(notice);
  });

  it('must not act on a notification of another channel, or a payload that is not a notice', async () => {
    startLogListener(onNotice, onListening);
    await flushMicrotasks();

    clients[0].notify('other_channel', encodeLogNotice(notice));
    clients[0].notify(YJS_LOG_CHANNEL, 'not json');
    clients[0].notify(YJS_LOG_CHANNEL, JSON.stringify({ t: 'tenant-1', e: 'task', i: 'entity-1', id: 'seven' }));
    expect(onNotice).not.toHaveBeenCalled();
  });

  it('replaces a dropped connection with backoff, and catches up after each new LISTEN', async () => {
    startLogListener(onNotice, onListening);
    await flushMicrotasks();
    // The database ends the session (a restart, pg_terminate_backend); the next two attempts fail.
    connectErrors.push(new Error('ECONNREFUSED'), new Error('ECONNREFUSED'));
    clients[0].emit('error', new Error('terminating connection due to administrator command'));
    clients[0].emit('end');
    expect(logListenerStatus()).toBe('connecting');
    expect(clients[0].ended).toBe(true);

    await vi.advanceTimersByTimeAsync(999);
    expect(clients).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(clients).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(clients).toHaveLength(3);
    expect(onListening).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4000);
    expect(clients).toHaveLength(4);

    expect(logListenerStatus()).toBe('listening');
    expect(onListening).toHaveBeenCalledTimes(2);
    // A late event of a retired connection changes nothing.
    clients[0].notify(YJS_LOG_CHANNEL, encodeLogNotice(notice));
    expect(onNotice).not.toHaveBeenCalled();
    clients[3].notify(YJS_LOG_CHANNEL, encodeLogNotice(notice));
    expect(onNotice).toHaveBeenCalledTimes(1);
  });

  it('waits thirty seconds at most between attempts', async () => {
    connectErrors.push(...Array.from({ length: 8 }, () => new Error('ECONNREFUSED')));
    startLogListener(onNotice, onListening);
    // 1 + 2 + 4 + 8 + 16 seconds, then 30 each.
    await vi.advanceTimersByTimeAsync(31_000);
    expect(clients).toHaveLength(6);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(clients).toHaveLength(6);
    await vi.advanceTimersByTimeAsync(1);
    expect(clients).toHaveLength(7);
  });

  it('stops for good: the connection ends and no reconnect follows', async () => {
    startLogListener(onNotice, onListening);
    await flushMicrotasks();

    await stopLogListener();
    expect(clients[0].ended).toBe(true);
    expect(logListenerStatus()).toBe('off');
    clients[0].emit('end');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(clients).toHaveLength(1);
  });
});
