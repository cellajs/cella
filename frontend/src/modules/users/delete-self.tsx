import { deleteSelf as baseDeleteSelf } from '~/api/me';
import type { User } from '~/types/common';

import { useNavigate } from '@tanstack/react-router';
import { useMutation } from '~/hooks/use-mutations';
import { queryClient } from '~/lib/router';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import { useAlertStore } from '~/store/alert';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';
import { usersKeys } from '~/utils/quey-key-factories';

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
        queryKey: usersKeys.single(user.id),
      });

      // Clear all user data
      clearLastUser();
      clearNavigationStore();
      clearAlertStore();

      navigate({ to: '/sign-out', replace: true });
      if (isDialog) dialog.remove();
      callback?.(user);
    },
  });

  const onDelete = () => {
    deleteSelf();
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default DeleteSelf;
