import { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useDeleteRequestMutation } from '~/modules/requests/query';
import type { Request } from '~/modules/requests/types';

interface Props {
  requests: Request[];
  dialog?: boolean;
  callback?: (args: CallbackArgs<Request[]>) => void;
}

const DeleteRequests = ({ requests, callback, dialog: isDialog }: Props) => {
  const removeDialog = useDialoger((state) => state.remove);

  const { mutate: deleteRequests, isPending } = useDeleteRequestMutation();

  const onDelete = () => {
    deleteRequests(requests, {
      onSuccess(_, requests) {
        if (isDialog) removeDialog();
        callback?.({ data: requests, status: 'success' });
      },
    });
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => removeDialog()} pending={isPending} />;
};

export default DeleteRequests;
