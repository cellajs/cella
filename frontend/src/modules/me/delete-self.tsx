import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { deleteMe } from '~/api.gen';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
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
  const removeDialog = useDialoger((state) => state.remove);

  const { user } = useUserStore();

  const { mutate: _deleteMe, isPending } = useMutation({
    mutationFn: async () => {
      await deleteMe();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usersKeys.single.byIdOrSlug(user.id) });

      navigate({ to: '/sign-out', replace: true, search: { force: true } });
      if (isDialog) removeDialog();
      callback?.(user);
    },
  });

  const onDelete = () => {
    _deleteMe(undefined);
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => removeDialog()} pending={isPending} />;
};

export default DeleteSelf;
