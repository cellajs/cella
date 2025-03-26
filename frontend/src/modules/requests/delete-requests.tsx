import type { Request } from '~/modules/requests/types';

import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useDeleteRequestMutation } from '~/modules/requests/query';

interface Props {
  requests: Request[];
  callback?: (organizations: Request[]) => void;
  dialog?: boolean;
}

const DeleteRequests = ({ requests, callback, dialog: isDialog }: Props) => {
  const removeDialog = useDialoger((state) => state.remove);

  const { mutate: deleteRequests, isPending } = useDeleteRequestMutation();

  const onDelete = () => {
    deleteRequests(requests, {
      onSuccess(_, requests) {
        if (isDialog) removeDialog();
        callback?.(requests);
      },
    });
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => removeDialog()} pending={isPending} />;
};

export default DeleteRequests;
