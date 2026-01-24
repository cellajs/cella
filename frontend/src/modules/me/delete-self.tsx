import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { User } from '~/api.gen';
import { deleteMe } from '~/api.gen';
import { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { userQueryKeys } from '~/modules/user/query';
import { queryClient } from '~/query/query-client';
import { useUserStore } from '~/store/user';

interface Props {
  dialog?: boolean;
  callback?: (user: CallbackArgs<User>) => void;
}

function DeleteSelf({ callback, dialog: isDialog }: Props) {
  const navigate = useNavigate();
  const removeDialog = useDialoger((state) => state.remove);

  const { user } = useUserStore();

  const { mutate: _deleteMe, isPending } = useMutation({
    mutationFn: async () => {
      await deleteMe();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userQueryKeys.detail.byId(user.id) });

      navigate({ to: '/sign-out', replace: true, search: { force: true } });
      if (isDialog) removeDialog();

      callback?.({ data: user, status: 'success' });
    },
  });

  const onDelete = () => {
    _deleteMe(undefined);
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => removeDialog()} pending={isPending} />;
}

export default DeleteSelf;
