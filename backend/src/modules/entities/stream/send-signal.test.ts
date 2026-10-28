import type { SSEStreamingApi } from 'hono/streaming';
import { afterEach, describe, expect, it } from 'vitest';
import { defineBackendModule } from '#/lib/module';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { mockMembershipBase } from '#/modules/memberships/memberships-mocks';
import { buildSubject } from '#/permissions/build-subject';
import { memberRole } from '../../../../tests/fixtures';
import { toReaders, toUser } from './audiences';
import { sendSignal } from './send-signal';
import { streamSubscriberManager } from './subscriber-manager';

const org = 'org-signals';

defineBackendModule({
  name: 'send-signal-test',
  owner: 'cella',
  description: 'Declares the signal type the tests send',
  scope: ['backend'],
  signals: [{ type: 'signal-test.changed', audiences: ['user', 'readers'] }],
});

/** A stream on the organization's topic and its user's topic, recording every frame written to it. */
const openStream = (userId: string, memberships: MembershipBaseModel[] = []) => {
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
    memberships,
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

  it("reaches the organization's readers and must not reach a stream whose membership is gone or of another organization", async () => {
    const member = openStream('member-user', [mockMembershipBase('mem-signals-member', { channelId: org, userId: 'member-user', role: memberRole })]);
    // On the organization's topic since it connected, without the membership: the decision is made per signal.
    const removed = openStream('removed-user');
    const otherOrg = openStream('other-user', [
      mockMembershipBase('mem-signals-other', { channelId: 'org-elsewhere', userId: 'other-user', role: memberRole }),
    ]);

    await sendSignal('signal-test.changed', toReaders(buildSubject('organization', {}, { id: org })), { organizationId: org });

    expect(member.map(({ data }) => JSON.parse(data))).toEqual([
      { type: 'signal-test.changed', organizationId: org, subjectId: null, version: null },
    ]);
    expect(removed).toEqual([]);
    expect(otherOrg).toEqual([]);
  });

  it('must not send a type no module declared for that audience', async () => {
    const frames = openStream('user-a');

    await sendSignal('signal-test.undeclared', toUser('user-a'), { organizationId: org });

    expect(frames).toEqual([]);
  });
});
