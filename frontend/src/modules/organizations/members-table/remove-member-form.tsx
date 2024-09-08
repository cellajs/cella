import { removeMembers as baseRemoveMembers } from '~/api/memberships';
import { useMutation } from '~/hooks/use-mutations';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import type { ContextEntity, Member } from '~/types/common';

interface Props {
  entityId: string;
  entityType?: ContextEntity;
  members: Member[];
  callback?: (members: Member[]) => void;
  dialog?: boolean;
}

const RemoveMembersForm = ({ members, entityId, entityType = 'organization', callback, dialog: isDialog }: Props) => {
  const { mutate: removeMembers, isPending } = useMutation({
    mutationFn: baseRemoveMembers,
    onSuccess: () => {
      // for (const member of members) {
      //   queryClient.invalidateQueries({
      //     queryKey: ['members', member.id],
      //   });
      // }
      callback?.(members);
      if (isDialog) dialog.remove();
    },
  });

  const onRemoveMember = () => {
    removeMembers({
      idOrSlug: entityId,
      entityType: entityType,
      ids: members.map((member) => member.id),
    });
  };

  return <DeleteForm onDelete={onRemoveMember} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default RemoveMembersForm;
