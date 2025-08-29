import type { Organization } from '~/api.gen';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useOrganizationDeleteMutation } from '~/modules/organizations/query';
import type { TableOrganization } from '~/modules/organizations/types';

export type OrganizationToDelete = TableOrganization | Organization;

interface Props {
  organizations: OrganizationToDelete[];
  callback?: (organizations: OrganizationToDelete[]) => void;
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
