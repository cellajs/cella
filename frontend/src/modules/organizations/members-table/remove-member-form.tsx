import { useTranslation } from 'react-i18next';
import { removeMembersFromOrganization as baseRemoveMembersFromOrganization } from '~/api/organizations';
import type { Member, Organization } from '~/types';

import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';
import { useMutation } from '~/hooks/use-mutations';

interface Props {
  organization: Organization;
  members: Member[];
  callback?: (members: Member[]) => void;
  dialog?: boolean;
}

const RemoveMembersForm = ({ members, organization, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();

  const { mutate: removeMembersFromOrganization, isPending } = useMutation({
    mutationFn: baseRemoveMembersFromOrganization,
    onSuccess: () => {
      callback?.(members);

      if (isDialog) {
        dialog.remove();
      }
    },
  });

  const onRemoveMember = () => {
    removeMembersFromOrganization({
      organizationIdentifier: organization.id,
      userIds: members.map((member) => member.id),
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
