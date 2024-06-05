import { useTranslation } from 'react-i18next';
import { removeMembersFromResource as baseremoveMembersFromResource } from '~/api/memberships';
import type { User } from '~/types';
import { useMutation } from '~/hooks/use-mutations';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';

interface Props {
  organizationIdOrSlug: string;
  members: User[];
  callback?: (members: User[]) => void;
  dialog?: boolean;
}

const RemoveMembersForm = ({ members, organizationIdOrSlug, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();

  const { mutate: removeMembersFromResource, isPending } = useMutation({
    mutationFn: baseremoveMembersFromResource,
    onSuccess: () => {
      callback?.(members);

      if (isDialog) {
        dialog.remove();
      }
    },
  });

  const onRemoveMember = () => {
    removeMembersFromResource({
      idOrSlug: organizationIdOrSlug,
      entityType: 'ORGANIZATION',
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
