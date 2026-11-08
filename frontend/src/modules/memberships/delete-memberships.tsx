import { DeleteItems, type DeleteItemsProps } from '~/modules/common/delete-items';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import type { EnrichedChannel } from '~/modules/entities/types';
import { useMembershipsDeleteMutation } from '~/modules/memberships/query-mutations';
import type { DeleteMembershipsVariables, Member } from '~/modules/memberships/types';

interface DeleteMembershipsProps extends Pick<DeleteItemsProps<Member, DeleteMembershipsVariables>, 'callback'> {
  channel: EnrichedChannel;
  members: Member[];
}

export function DeleteMemberships({ members, channel, ...props }: DeleteMembershipsProps) {
  const mutation = useMembershipsDeleteMutation();

  const toVariables = (items: Member[]) => ({
    path: { tenantId: channel.tenantId, organizationId: channelOrganizationId(channel) },
    body: { ids: items.map(({ id }) => id) },
    query: { entityId: channel.id, entityType: channel.entityType },
    members: items,
  });

  return (
    <DeleteItems items={members} mutation={mutation} toVariables={toVariables} resource="c:member" label="c:remove_resource" optimistic {...props} />
  );
}
