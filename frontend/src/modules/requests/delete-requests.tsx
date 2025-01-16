import type { Request } from '~/types/common';

import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import { useDeleteRequestsMutation } from '~/modules/requests/query-mutations';

interface Props {
  requests: Request[];
  callback?: (organizations: Request[]) => void;
  dialog?: boolean;
}

const DeleteRequests = ({ requests, callback, dialog: isDialog }: Props) => {
  const { mutate: deleteRequests, isPending } = useDeleteRequestsMutation();

  const onDelete = () => {
    deleteRequests(
      requests.map((req) => req.id),
      {
        onSuccess: () => {
          if (isDialog) dialog.remove();
          callback?.(requests);
        },
      },
    );
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default DeleteRequests;
