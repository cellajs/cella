import type { SSEStreamingApi } from 'hono/streaming';
import { afterEach, describe, expect, it } from 'vitest';
import { defineBackendModule } from '#/lib/module';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { toUser } from './audiences';
import { sendSignal } from './send-signal';
import { streamSubscriberManager } from './subscriber-manager';

const org = 'org-signals';

defineBackendModule({
  name: 'send-signal-test',
  owner: 'cella',
  description: 'Declares the signal type the tests send',
  scope: ['backend'],
  signals: [{ type: 'signal-test.changed', audiences: ['user'] }],
});

/** A stream on the organization's topic and its user's topic, recording every frame written to it. */
const openStream = (userId: string) => {
  const frames: { event?: string; id?: string; data: string }[] = [];
  const stream = {
    writeSSE: async (frame: { event?: string; id?: string; data: string }) => {
      frames.push(frame);
    },
  } as unknown as SSEStreamingApi;
  const subscriber: AppStreamSubscriber = {
    id: crypto.randomUUID(),
    topic: `org:${org}`,
    stream,
    userId,
    sessionId: `session-${userId}`,
    organizationIds: new Set([org]),
    isSystemAdmin: false,
    systemAccessAllowed: false,
    memberships: [],
  };
  streamSubscriberManager.register(subscriber, [`user:${userId}`]);
  return frames;
};

afterEach(() => {
  for (const subscriber of streamSubscriberManager.all()) streamSubscriberManager.unregister(subscriber.id);
});

describe('sendSignal: who hears it', () => {
  it('reaches every stream of its user and no other, a stream on the same organization topic included', async () => {
    const own = [openStream('user-a'), openStream('user-a')];
    const bystander = openStream('user-b');

    await sendSignal('signal-test.changed', toUser('user-a'), { organizationId: org, subjectId: 'row-1' });

    for (const frames of own) {
      // A signal carries no id: the client's stream cursor is an activity id, and a signal must not move it.
      expect(frames).toEqual([{ event: 'signal', id: undefined, data: expect.any(String) }]);
      expect(JSON.parse(frames[0].data)).toEqual({ type: 'signal-test.changed', organizationId: org, subjectId: 'row-1', version: null });
    }
    expect(bystander).toEqual([]);
  });

  it('must not send a type no module declared for that audience', async () => {
    const frames = openStream('user-a');

    await sendSignal('signal-test.undeclared', toUser('user-a'), { organizationId: org });

    expect(frames).toEqual([]);
  });
});
