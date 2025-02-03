import type { Request } from '~/types/common';

import { useMutation } from '@tanstack/react-query';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import { deleteRequests } from './api';
import { requestsKeys } from './query';

interface Props {
  requests: Request[];
  callback?: (organizations: Request[]) => void;
  dialog?: boolean;
}

const DeleteRequests = ({ requests, callback, dialog: isDialog }: Props) => {
  const { mutate: _deleteRequests, isPending } = useMutation({
    mutationKey: requestsKeys.delete(),
    mutationFn: deleteRequests,
    onSuccess: () => {
      if (isDialog) dialog.remove();
      callback?.(requests);
    },
  });

  const onDelete = () => {
    _deleteRequests(requests.map((req) => req.id));
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default DeleteRequests;
