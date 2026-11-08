import type { SSEStreamingApi } from 'hono/streaming';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';

/**
 * A signed-in user's subscriber on `topicOrg`'s topic, writing to `stream`: neither a system admin nor connected from a
 * system-access address, with a session of its own.
 */
export const streamSubscriber = (
  userId: string,
  stream: SSEStreamingApi,
  memberships: MembershipBaseModel[],
  topicOrg: string,
  organizationIds = [topicOrg],
): AppStreamSubscriber => ({
  id: crypto.randomUUID(),
  topic: `org:${topicOrg}`,
  stream,
  userId,
  sessionId: `session-${userId}`,
  organizationIds: new Set(organizationIds),
  isSystemAdmin: false,
  systemAccessAllowed: false,
  memberships,
});
