import type { Organization } from '~/api.gen';
import { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useOrganizationDeleteMutation } from '~/modules/organization/query';

interface Props {
  tenantId: string;
  organizations: Organization[];
  dialog?: boolean;
  callback?: (args: CallbackArgs<Organization[]>) => void;
}

export function DeleteOrganizations({ tenantId, organizations, callback, dialog: isDialog }: Props) {
  const removeDialog = useDialoger((state) => state.remove);
  const { mutate: deleteOrganizations, isPending } = useOrganizationDeleteMutation();

  const onDelete = () => {
    deleteOrganizations(
      { path: { tenantId }, body: { ids: organizations.map(({ id }) => id) }, organizations },
      {
        onSuccess: (_, { organizations: deletedOrgs }) => {
          if (isDialog) removeDialog();
          callback?.({ data: deletedOrgs, status: 'success' });
        },
      },
    );
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => removeDialog()} pending={isPending} />;
}
