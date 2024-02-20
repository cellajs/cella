import { useTranslation } from 'react-i18next';
import { removeMembersFromOrganization } from '~/api/organizations';
import { Member, Organization } from '~/types';

import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';

interface Props {
  organization: Organization;
  members: Member[];
  callback?: (members: Member[]) => void;
  dialog?: boolean;
}

const RemoveMembersForm = ({ members, organization, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();
  const [apiWrapper, pending] = useApiWrapper();

  const onRemoveMember = () => {
    apiWrapper(
      () =>
        removeMembersFromOrganization(
          organization.id,
          members.map((member) => member.id),
        ),
      () => {
        callback?.(members);

        if (isDialog) {
          dialog.remove();
        }
      },
    );
  };

  return (
    <div className="flex flex-col-reverse sm:flex-row gap-2">
      <Button type="submit" variant="destructive" onClick={onRemoveMember} loading={pending}>
        {t('action.remove')}
      </Button>
      <Button type="reset" variant="secondary" onClick={() => dialog.remove()}>
        {t('action.cancel')}
      </Button>
    </div>
  );
};

export default RemoveMembersForm;
