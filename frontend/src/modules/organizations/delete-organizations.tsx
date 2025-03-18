import type { Organization } from '~/modules/organizations/types';

import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useOrganizationDeleteMutation } from '~/modules/organizations/query';

interface Props {
  organizations: Organization[];
  callback?: (organizations: Organization[]) => void;
  dialog?: boolean;
}

const DeleteOrganizations = ({ organizations, callback, dialog: isDialog }: Props) => {
  const removeDialog = useDialoger((state) => state.remove);
  const { mutate: deleteOrganizations, isPending } = useOrganizationDeleteMutation();

  const onDelete = () => {
    deleteOrganizations(organizations, {
      onSuccess: () => {
        if (isDialog) removeDialog();
        callback?.(organizations);
      },
    });
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => removeDialog()} pending={isPending} />;
};

export default DeleteOrganizations;
