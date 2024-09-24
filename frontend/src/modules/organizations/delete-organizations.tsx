import { deleteOrganizations as baseDeleteOrganizations } from '~/api/organizations';
import type { Organization } from '~/types/common';

import { onlineManager } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMutation } from '~/hooks/use-mutations';
import { queryClient } from '~/lib/router';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';

interface Props {
  organizations: Organization[];
  callback?: (organizations: Organization[]) => void;
  dialog?: boolean;
}

const DeleteOrganizations = ({ organizations, callback, dialog: isDialog }: Props) => {
  const { t } = useTranslation();

  const { mutate: deleteOrganizations, isPending } = useMutation({
    mutationFn: baseDeleteOrganizations,
    onSuccess: () => {
      for (const organization of organizations) {
        queryClient.invalidateQueries({
          queryKey: ['organizations', organization.id],
        });
      }

      if (isDialog) dialog.remove();
      callback?.(organizations);
    },
  });

  const onDelete = () => {
    if (!onlineManager.isOnline()) return toast.warning(t('common:action.offline.text'));

    deleteOrganizations(organizations.map((organization) => organization.id));
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default DeleteOrganizations;
