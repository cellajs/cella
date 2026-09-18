import { describe, expect, it, vi } from 'vitest';
import { authEvents } from '#/modules/auth/auth-events';
import '#/modules/entities/entities-listeners';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { streamSubscriberManager } from './subscriber-manager';

const USER = 'user-revoke';

/** Registers a subscriber whose stream records SSE writes and the abort/close calls the listener makes. */
const register = (sessionId: string) => {
  const stream = { aborted: false, closed: false, written: [] as unknown[] };
  Object.assign(stream, {
    writeSSE: async (message: unknown) => void stream.written.push(message),
    abort: () => (stream.aborted = true),
    close: async () => (stream.closed = true),
  });
  const subscriber = {
    id: sessionId,
    stream,
    userId: USER,
    sessionId,
    memberships: [],
  } as unknown as AppStreamSubscriber;
  streamSubscriberManager.register(subscriber, [`user:${USER}`]);
  return stream;
};

describe('session.deleted closes the streams bound to that session', () => {
  it('writes the permanent error and ends only that session; other sessions of the user stay live', async () => {
    const ended = register('session-1');
    const kept = register('session-2');

    authEvents.emit('session.deleted', { userId: USER, sessionIds: ['session-1'] });
    await vi.waitFor(() => expect(ended.closed).toBe(true));

    expect(ended.written).toEqual([
      { event: 'error', data: JSON.stringify({ code: 'unauthorized', message: 'Session ended' }) },
    ]);
    expect(ended.aborted).toBe(true);
    expect(streamSubscriberManager.getByChannel(`user:${USER}`).map((s) => s.id)).toEqual(['session-2']);
    expect(kept.written).toEqual([]);
    expect(kept.closed).toBe(false);

    streamSubscriberManager.unregister('session-2');
  });
});
