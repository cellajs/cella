import type { Request } from 'sdk';
import { DeleteItems, type DeleteItemsProps } from '~/modules/common/delete-items';
import { useDeleteRequestMutation } from '~/modules/requests/query';

interface DeleteRequestsProps extends Pick<DeleteItemsProps<Request, Request[]>, 'callback'> {
  requests: Request[];
}

export function DeleteRequests({ requests, ...props }: DeleteRequestsProps) {
  const mutation = useDeleteRequestMutation();
  return <DeleteItems items={requests} mutation={mutation} toVariables={(items) => items} resource="c:request" {...props} />;
}
