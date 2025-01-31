import type { Organization } from '~/modules/organizations/types';

import { queryClient } from '~/lib/router';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import { deleteMenuItem } from '~/modules/navigation/menu-sheet/helpers/menu-operations';
import { organizationsKeys } from '~/modules/organizations/query';
import { useOrganizationDeleteMutation } from '~/modules/organizations/query';

interface Props {
  organizations: Organization[];
  callback?: (organizations: Organization[]) => void;
  dialog?: boolean;
}

const DeleteOrganizations = ({ organizations, callback, dialog: isDialog }: Props) => {
  const { mutate: deleteOrganizations, isPending } = useOrganizationDeleteMutation();

  const onDelete = () => {
    deleteOrganizations(
      organizations.map((organization) => organization.id),
      {
        onSuccess: () => {
          for (const organization of organizations) {
            queryClient.invalidateQueries({
              queryKey: organizationsKeys.single(organization.id),
            });
            deleteMenuItem(organization.id);
          }
          if (isDialog) dialog.remove();
          callback?.(organizations);
        },
      },
    );
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default DeleteOrganizations;
