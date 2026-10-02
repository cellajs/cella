import type { Request } from 'sdk';
import { DeleteItems, type DeleteItemsProps } from '~/modules/common/delete-items';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useDeleteRequestMutation } from '~/modules/requests/query';

type Props = Pick<DeleteItemsProps<Request, Request[]>, 'dialog' | 'callback'> & { requests: Request[] };

/** Cancel closes the dialog without reporting to `callback`. */
export function DeleteRequests({ requests, ...props }: Props) {
  const mutation = useDeleteRequestMutation();
  return (
    <DeleteItems items={requests} mutation={mutation} toVariables={(items) => items} onCancel={() => useDialoger.getState().remove()} {...props} />
  );
}
