import { useTranslation } from 'react-i18next';
import { removeMemberFromOrganization } from '~/api/organizations';
import { Member, Organization } from '~/types';

import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';

interface Props {
  organization: Organization;
  members: Member[];
  callback?: () => void;
  dialog?: boolean;
}

const RemoveMembersForm = ({ members, organization, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();
  const [apiWrapper, pending] = useApiWrapper();

  const onRemoveMember = () => {
    apiWrapper(
      () => Promise.all(members.map((member) => removeMemberFromOrganization(organization.id, member.id))),
      () => {
        callback?.();

        if (isDialog) {
          dialog.remove();
        }
      },
    );
  };

  return (
    <div className="flex flex-col-reverse sm:flex-row gap-2">
      <Button type="submit" variant="destructive" onClick={onRemoveMember} loading={pending}>
        {t('action.remove', {
          defaultValue: 'Remove',
        })}
      </Button>
      <Button variant="secondary" onClick={() => dialog.remove()}>
        {t('action.cancel', {
          defaultValue: 'Cancel',
        })}
      </Button>
    </div>
  );
};

export default RemoveMembersForm;
