import { DeleteItems, type DeleteItemsProps } from '~/modules/common/delete-items';
import { useUserDeleteMutation } from '~/modules/user/query';
import type { BaseUser } from '~/modules/user/types';

type Props = Pick<DeleteItemsProps<BaseUser, BaseUser[]>, 'dialog' | 'callback'> & { users: BaseUser[] };

export function DeleteUsers({ users, ...props }: Props) {
  return (
    <DeleteItems
      items={users}
      useDelete={useUserDeleteMutation}
      toVariables={(items) => items}
      onlineOnly
      callbackFirst
      {...props}
    />
  );
}
