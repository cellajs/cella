import { deleteSelf as baseDeleteSelf } from '~/api/me';
import type { User } from '~/types';

import { useMutation } from '~/hooks/use-mutations';
import { queryClient } from '~/lib/router';
import { DeleteForm } from '../common/delete-form';
import { dialog } from '../common/dialoger/state';
import { useUserStore } from '~/store/user';
import { useNavigate } from '@tanstack/react-router';

interface Props {
  callback?: (user: User) => void;
  dialog?: boolean;
}

const DeleteSelf = ({ callback, dialog: isDialog }: Props) => {
  const navigate = useNavigate();
  const { user, clearLastUser } = useUserStore();
  const { mutate: deleteSelf, isPending } = useMutation({
    mutationFn: baseDeleteSelf,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['users', user.id],
      });
      clearLastUser();
      callback?.(user);
      navigate({ to: '/sign-out', replace: true });
      if (isDialog) dialog.remove();
    },
  });

  const onDelete = () => {
    deleteSelf();
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default DeleteSelf;
