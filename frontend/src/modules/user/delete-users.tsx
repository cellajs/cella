import { DeleteItems, type DeleteItemsProps } from '~/modules/common/delete-items';
import { useUserDeleteMutation } from '~/modules/user/query';
import type { BaseUser } from '~/modules/user/types';

interface DeleteUsersProps extends Pick<DeleteItemsProps<BaseUser, BaseUser[]>, 'callback'> {
  users: BaseUser[];
}

export function DeleteUsers({ users, ...props }: DeleteUsersProps) {
  const mutation = useUserDeleteMutation();
  return <DeleteItems items={users} mutation={mutation} toVariables={(items) => items} resource="c:user" onlineOnly callbackFirst {...props} />;
}
