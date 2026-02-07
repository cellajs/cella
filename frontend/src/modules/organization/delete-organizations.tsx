import type { Organization } from '~/api.gen';
import { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useOrganizationDeleteMutation } from '~/modules/organization/query';

interface Props {
  organizations: Organization[];
  dialog?: boolean;
  callback?: (args: CallbackArgs<Organization[]>) => void;
}

export function DeleteOrganizations({ organizations, callback, dialog: isDialog }: Props) {
  const removeDialog = useDialoger((state) => state.remove);
  const { mutate: deleteOrganizations, isPending } = useOrganizationDeleteMutation();

  const onDelete = () => {
    deleteOrganizations(organizations, {
      onSuccess: (_, paasedOrganizations) => {
        if (isDialog) removeDialog();
        callback?.({ data: paasedOrganizations, status: 'success' });
      },
    });
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => removeDialog()} pending={isPending} />;
}
