import type { ChannelEntityType } from 'shared';
import { DeleteItems, type DeleteItemsProps } from '~/modules/common/delete-items';
import { useMembershipsDeleteMutation } from '~/modules/memberships/query-mutations';
import type { DeleteMembershipsVariables, Member } from '~/modules/memberships/types';

interface DeleteMembershipsProps extends Pick<DeleteItemsProps<Member, DeleteMembershipsVariables>, 'callback'> {
  entityId: string;
  tenantId: string;
  organizationId: string;
  members: Member[];
  entityType: ChannelEntityType;
}

export function DeleteMemberships({ members, entityId, entityType, tenantId, organizationId, ...props }: DeleteMembershipsProps) {
  const mutation = useMembershipsDeleteMutation();

  const toVariables = (items: Member[]) => ({
    path: { tenantId, organizationId },
    body: { ids: items.map(({ id }) => id) },
    query: { entityId, entityType },
    members: items,
  });

  return (
    <DeleteItems items={members} mutation={mutation} toVariables={toVariables} resource="c:member" label="c:remove_resource" optimistic {...props} />
  );
}
