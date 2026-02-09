import type { ContextEntityType } from 'shared';
import { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useMembershipsDeleteMutation } from '~/modules/memberships/query-mutations';
import type { Member } from '~/modules/memberships/types';

interface Props {
  entityId: string;
  tenantId: string;
  orgId: string;
  members: Member[];
  entityType: ContextEntityType;
  dialog?: boolean;
  callback?: (args: CallbackArgs<Member[]>) => void;
}

export function DeleteMemberships({
  members,
  entityId,
  entityType,
  tenantId,
  orgId,
  callback,
  dialog: isDialog,
}: Props) {
  const removeDialog = useDialoger((state) => state.remove);
  const { mutate: deleteMemberships, isPending } = useMembershipsDeleteMutation();

  const onDeleteMembers = () => {
    deleteMemberships({ tenantId, orgId, entityId, entityType, members });

    if (isDialog) removeDialog();
    callback?.({ data: members, status: 'success' });
  };

  return (
    <DeleteForm
      allowOfflineDelete={true}
      onDelete={onDeleteMembers}
      onCancel={() => removeDialog()}
      pending={isPending}
    />
  );
}
