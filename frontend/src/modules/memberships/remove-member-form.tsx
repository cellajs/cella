import type { ContextEntityType } from 'config';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useMembersDeleteMutation } from '~/modules/memberships/query-mutations';
import type { Member } from '~/modules/memberships/types';

interface Props {
  entityIdOrSlug: string;
  organizationId: string;
  members: Member[];
  entityType?: ContextEntityType;
  dialog?: boolean;
  callback?: (members: Member[]) => void;
}

const RemoveMembersForm = ({ members, entityIdOrSlug, entityType = 'organization', organizationId, callback, dialog: isDialog }: Props) => {
  const removeDialog = useDialoger((state) => state.remove);
  const { mutate: removeMembers, isPending } = useMembersDeleteMutation();

  const onRemoveMember = () => {
    removeMembers({ orgIdOrSlug: organizationId, idOrSlug: entityIdOrSlug, entityType, members });

    if (isDialog) removeDialog();
    callback?.(members);
  };

  return <DeleteForm allowOfflineDelete={true} onDelete={onRemoveMember} onCancel={() => removeDialog()} pending={isPending} />;
};

export default RemoveMembersForm;
