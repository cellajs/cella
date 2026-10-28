import type { UserMenuItem } from '~/modules/me/types';
import type { UpdateMembershipVariables } from '~/modules/memberships/types';

export const buildMembershipUpdate = (item: UserMenuItem, body: UpdateMembershipVariables['body']): UpdateMembershipVariables => ({
  path: { id: item.membership.id, tenantId: item.tenantId, organizationId: item.membership.organizationId || item.id },
  body,
  channelId: item.id,
  channelType: item.entityType,
});
