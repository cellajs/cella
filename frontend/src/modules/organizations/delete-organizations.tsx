import { deleteOrganizations as baseDeleteOrganizations } from '~/api/organizations';
import type { Organization } from '~/types/common';

import { useMutation } from '~/hooks/use-mutations';
import { queryClient } from '~/lib/router';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import { deleteMenuItem } from '~/modules/common/nav-sheet/helpers/menu-operations';
import { organizationsKeys } from '~/utils/quey-key-factories';

interface Props {
  organizations: Organization[];
  callback?: (organizations: Organization[]) => void;
  dialog?: boolean;
}

const DeleteOrganizations = ({ organizations, callback, dialog: isDialog }: Props) => {
  const { mutate: deleteOrganizations, isPending } = useMutation({
    mutationFn: baseDeleteOrganizations,
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
  });

  const onDelete = () => {
    deleteOrganizations(organizations.map((organization) => organization.id));
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default DeleteOrganizations;
