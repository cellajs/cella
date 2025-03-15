import type { Organization } from '~/modules/organizations/types';

import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { deleteMenuItem } from '~/modules/navigation/menu-sheet/helpers/menu-operations';
import { organizationsKeys, useOrganizationDeleteMutation } from '~/modules/organizations/query';
import { queryClient } from '~/query/query-client';

interface Props {
  organizations: Organization[];
  callback?: (organizations: Organization[]) => void;
  dialog?: boolean;
}

const DeleteOrganizations = ({ organizations, callback, dialog: isDialog }: Props) => {
  const removeDialog = useDialoger((state) => state.remove);
  const { mutate: deleteOrganizations, isPending } = useOrganizationDeleteMutation();

  const onDelete = () => {
    deleteOrganizations(
      organizations.map((organization) => organization.id),
      {
        onSuccess: () => {
          for (const organization of organizations) {
            queryClient.invalidateQueries({ queryKey: organizationsKeys.single(organization.id) });
            queryClient.invalidateQueries({ queryKey: organizationsKeys.single(organization.slug) });
            deleteMenuItem(organization.id);
          }
          if (isDialog) removeDialog();
          callback?.(organizations);
        },
      },
    );
  };

  return <DeleteForm onDelete={onDelete} onCancel={removeDialog} pending={isPending} />;
};

export default DeleteOrganizations;
