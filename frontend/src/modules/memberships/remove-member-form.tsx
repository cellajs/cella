import type { ContextEntity } from 'config';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import { useMembersDeleteMutation } from '~/modules/memberships/query-mutations';
import type { Member } from '~/modules/memberships/types';

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
