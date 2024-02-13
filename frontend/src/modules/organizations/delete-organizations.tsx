import { deleteOrganizations } from '~/api/organizations';
import { Organization } from '~/types';

import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';

interface Props {
  organizations: Organization[];
  callback?: (organizations: Organization[]) => void;
  dialog?: boolean;
}

const DeleteOrganizations = ({ organizations, callback, dialog: isDialog }: Props) => {
  const [apiWrapper, pending] = useApiWrapper();

  const onDelete = () => {
    apiWrapper(
      () => deleteOrganizations(organizations.map((organization) => organization.id)),
      () => {
        callback?.(organizations);

        if (isDialog) {
          dialog.remove();
        }
      },
    );
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={pending} />;
};

export default DeleteOrganizations;
