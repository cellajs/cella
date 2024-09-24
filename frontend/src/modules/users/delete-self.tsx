import { deleteSelf as baseDeleteSelf } from '~/api/me';
import type { User } from '~/types/common';

import { onlineManager } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMutation } from '~/hooks/use-mutations';
import { queryClient } from '~/lib/router';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import { useAlertStore } from '~/store/alert';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';

interface Props {
  callback?: (user: User) => void;
  dialog?: boolean;
}

const DeleteSelf = ({ callback, dialog: isDialog }: Props) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
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

      navigate({ to: '/sign-out', replace: true });
      if (isDialog) dialog.remove();
      callback?.(user);
    },
  });

  const onDelete = () => {
    if (!onlineManager.isOnline()) return toast.warning(t('common:action.offline.text'));

    deleteSelf();
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default DeleteSelf;
