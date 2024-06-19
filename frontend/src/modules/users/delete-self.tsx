import { deleteSelf as baseDeleteSelf } from '~/api/me';
import type { User } from '~/types';

import { useNavigate } from '@tanstack/react-router';
import { useMutation } from '~/hooks/use-mutations';
import { queryClient } from '~/lib/router';
import { useAlertStore } from '~/store/alert';
import { useUserStore } from '~/store/user';
import { useNavigationStore } from '~/store/navigation';
import { DeleteForm } from '../common/delete-form';
import { dialog } from '../common/dialoger/state';

interface Props {
  callback?: (user: User) => void;
  dialog?: boolean;
}

const DeleteSelf = ({ callback, dialog: isDialog }: Props) => {
  const navigate = useNavigate();
  const { user, clearLastUser } = useUserStore();
  const { clearNavigationStore } = useNavigationStore();
  const { clearAlertStore } = useAlertStore();

  const { mutate: deleteSelf, isPending } = useMutation({
    mutationFn: baseDeleteSelf,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['users', user.id],
      });

      // Clear all user data
      clearLastUser();
      clearNavigationStore();
      clearAlertStore();

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
