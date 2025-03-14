import type { ContextEntity } from 'config';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import { useMembersDeleteMutation } from '~/modules/memberships/query/mutations';
import type { Member } from '~/modules/memberships/types';

interface Props {
  entityIdOrSlug: string;
  organizationId: string;
  members: Member[];
  entityType?: ContextEntity;
  dialog?: boolean;
  callback?: (members: Member[]) => void;
}

const RemoveMembersForm = ({ members, entityIdOrSlug, entityType = 'organization', organizationId, callback, dialog: isDialog }: Props) => {
  const { mutate: removeMembers, isPending } = useMembersDeleteMutation();

  const onRemoveMember = () => {
    removeMembers({ orgIdOrSlug: organizationId, idOrSlug: entityIdOrSlug, entityType, ids: members.map((member) => member.id) });

    if (isDialog) dialog.remove();
    callback?.(members);
  };

  return <DeleteForm allowOfflineDelete={true} onDelete={onRemoveMember} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default RemoveMembersForm;
