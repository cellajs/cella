import { deleteRequests as baseDeleteRequests } from '~/modules/requests/api';
import type { Request } from '~/types/common';

import { useMutation } from '~/hooks/use-mutations';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';

interface Props {
  requests: Request[];
  callback?: (organizations: Request[]) => void;
  dialog?: boolean;
}

const DeleteRequests = ({ requests, callback, dialog: isDialog }: Props) => {
  const { mutate: deleteRequests, isPending } = useMutation({
    mutationFn: baseDeleteRequests,
    onSuccess: () => {
      if (isDialog) dialog.remove();
      callback?.(requests);
    },
  });

  const onDelete = () => {
    deleteRequests(requests.map((req) => req.id));
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default DeleteRequests;
