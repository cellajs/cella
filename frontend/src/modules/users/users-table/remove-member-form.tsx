import { useTranslation } from 'react-i18next';
import { removeMembers as baseRemoveMembers } from '~/api/memberships';
import { useMutation } from '~/hooks/use-mutations';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';
import type { ContextEntity, Member } from '~/types';

interface Props {
  entityId: string;
  entityType?: ContextEntity;
  members: Member[];
  callback?: (members: Member[]) => void;
  dialog?: boolean;
}

const RemoveMembersForm = ({ members, entityId, entityType = 'ORGANIZATION', callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();

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

  return (
    <div className="flex flex-col-reverse sm:flex-row gap-2">
      <Button type="submit" variant="destructive" onClick={onRemoveMember} loading={isPending}>
        {t('common:remove')}
      </Button>
      <Button type="reset" variant="secondary" onClick={() => dialog.remove()}>
        {t('common:cancel')}
      </Button>
    </div>
  );
};

export default RemoveMembersForm;
