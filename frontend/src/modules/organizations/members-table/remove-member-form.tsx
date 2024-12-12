import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import { useMembersDeleteMutation } from '~/modules/common/query-client-provider/mutations/members';
import type { ContextEntity, Member } from '~/types/common';

interface Props {
  entityIdOrSlug: string;
  organizationId: string;
  members: Member[];
  entityType?: ContextEntity;
  callback?: (members: Member[]) => void;
  dialog?: boolean;
}

const RemoveMembersForm = ({ members, entityIdOrSlug, entityType = 'organization', organizationId, callback, dialog: isDialog }: Props) => {
  const { mutate: removeMembers, isPending } = useMembersDeleteMutation();

  const onRemoveMember = () => {
    removeMembers(
      {
        orgIdOrSlug: organizationId,
        idOrSlug: entityIdOrSlug,
        entityType,
        ids: members.map((member) => member.id),
      },
      {
        onSuccess: () => {
          callback?.(members);
          if (isDialog) dialog.remove();
        },
      },
    );
  };

  return <DeleteForm onDelete={onRemoveMember} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default RemoveMembersForm;
