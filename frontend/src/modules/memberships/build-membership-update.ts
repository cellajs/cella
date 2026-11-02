import type { MembershipBase } from 'sdk';
import type { EnrichedChannel } from '~/modules/entities/types';
import type { UpdateMembershipVariables } from '~/modules/memberships/types';

type ChannelWithMembership = Pick<EnrichedChannel, 'id' | 'tenantId' | 'entityType'> & { membership: Pick<MembershipBase, 'id' | 'organizationId'> };

export const buildMembershipUpdate = (channel: ChannelWithMembership, body: UpdateMembershipVariables['body']): UpdateMembershipVariables => ({
  path: { id: channel.membership.id, tenantId: channel.tenantId, organizationId: channel.membership.organizationId },
  body,
  channelId: channel.id,
  channelType: channel.entityType,
});
