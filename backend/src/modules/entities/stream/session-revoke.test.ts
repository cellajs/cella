import type { SSEStreamingApi } from 'hono/streaming';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authEvents } from '#/modules/auth/auth-events';
import '#/modules/entities/entities-listeners';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { streamSubscriberManager } from './subscriber-manager';

const USER = 'user-revoke';

/** Minimal stream: records SSE writes and the abort/close calls the listener makes. */
const fakeStream = () => {
  const written: { event?: string; data: string }[] = [];
  const stream = {
    aborted: false,
    closed: false,
    writeSSE: async (message: { event?: string; data: string }) => {
      written.push(message);
    },
    abort() {
      this.aborted = true;
    },
    async close() {
      this.closed = true;
    },
  };
  return { stream: stream as unknown as SSEStreamingApi, state: stream, written };
};

const register = (sessionId: string) => {
  const fake = fakeStream();
  const subscriber: AppStreamSubscriber = {
    id: crypto.randomUUID(),
    channel: 'org:org-revoke',
    stream: fake.stream,
    userId: USER,
    sessionId,
    organizationIds: new Set(['org-revoke']),
    isSystemAdmin: false,
    memberships: [],
    cursor: null,
  };
  streamSubscriberManager.register(subscriber, [`user:${USER}`]);
  return { subscriber, ...fake };
};

afterEach(() => {
  for (const subscriber of streamSubscriberManager.getByChannel(`user:${USER}`)) {
    streamSubscriberManager.unregister(subscriber.id);
  }
});

describe('session.deleted closes the streams bound to that session', () => {
  it('writes the permanent error, unregisters, and ends the stream; other sessions of the user stay live', async () => {
    const ended = register('session-1');
    const kept = register('session-2');

    authEvents.emit('session.deleted', { userId: USER, sessionIds: ['session-1'] });

    await vi.waitFor(() => expect(ended.state.closed).toBe(true));

    expect(ended.written).toEqual([
      { event: 'error', data: JSON.stringify({ code: 'unauthorized', message: 'Session ended' }) },
    ]);
    expect(ended.state.aborted).toBe(true);

    const remaining = streamSubscriberManager.getByChannel<AppStreamSubscriber>(`user:${USER}`).map((s) => s.id);
    expect(remaining).toEqual([kept.subscriber.id]);
    expect(kept.written).toEqual([]);
    expect(kept.state.closed).toBe(false);
  });

  it('is a no-op for a user without subscribers', () => {
    expect(() => authEvents.emit('session.deleted', { userId: 'nobody', sessionIds: ['x'] })).not.toThrow();
  });
});
