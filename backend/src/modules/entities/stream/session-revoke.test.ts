import { afterEach, describe, expect, it, vi } from 'vitest';
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

const errorEvent = (code: string, message: string) => ({ event: 'error', data: JSON.stringify({ code, message }) });
const registeredIds = () => streamSubscriberManager.getByChannel(`user:${USER}`).map((s) => s.id);

afterEach(() => {
  for (const id of registeredIds()) streamSubscriberManager.unregister(id);
});

describe('session.revoked closes the streams bound to the ended sessions', () => {
  it('writes the final error and ends only that session; other sessions of the user stay live', async () => {
    const ended = register('session-1');
    const kept = register('session-2');

    authEvents.emit('session.revoked', { userId: USER, sessionIds: ['session-1'], reason: 'sign_out' });
    await vi.waitFor(() => expect(ended.closed).toBe(true));

    expect(ended.written).toEqual([errorEvent('unauthorized', 'Session revoked')]);
    expect(ended.aborted).toBe(true);
    expect(registeredIds()).toEqual(['session-2']);
    expect(kept.written).toEqual([]);
    expect(kept.closed).toBe(false);
  });
});
