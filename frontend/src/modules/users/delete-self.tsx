import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import { deleteSelf } from '~/modules/users/api';
import { usersKeys } from '~/modules/users/query';
import type { User } from '~/modules/users/types';
import { queryClient } from '~/query/query-client';
import { useUserStore } from '~/store/user';

interface Props {
  callback?: (user: User) => void;
  dialog?: boolean;
}

const DeleteSelf = ({ callback, dialog: isDialog }: Props) => {
  const navigate = useNavigate();

  const { user } = useUserStore();

  const { mutate: _deleteSelf, isPending } = useMutation({
    mutationFn: deleteSelf,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: usersKeys.single(user.id),
      });

      navigate({ to: '/sign-out', replace: true, search: { force: true } });
      if (isDialog) dialog.remove();
      callback?.(user);
    },
  });

  const onDelete = () => {
    _deleteSelf(undefined);
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default DeleteSelf;
