import type { Request } from 'sdk';
import { DeleteItems, type DeleteItemsProps } from '~/modules/common/delete-items';
import { useDeleteRequestMutation } from '~/modules/requests/query';

type Props = Pick<DeleteItemsProps<Request, Request[]>, 'dialog' | 'callback'> & { requests: Request[] };

export function DeleteRequests({ requests, ...props }: Props) {
  const mutation = useDeleteRequestMutation();
  return <DeleteItems items={requests} mutation={mutation} toVariables={(items) => items} {...props} />;
}
