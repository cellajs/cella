import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { User } from 'sdk';
import { deleteMe } from 'sdk';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { userQueryKeys } from '~/modules/user/query';
import { useCurrentUser } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';

interface Props {
  dialog?: boolean;
  callback?: (user: CallbackArgs<User>) => void;
}

export function DeleteSelf({ callback, dialog: isDialog }: Props) {
  const navigate = useNavigate();
  const removeDialog = useDialoger((state) => state.remove);

  const user = useCurrentUser();

  const { mutate: _deleteMe, isPending } = useMutation({
    mutationFn: async () => {
      await deleteMe();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userQueryKeys.detail.byId(user.id) });

      navigate({ to: '/auth/sign-out', replace: true, search: { force: true } });
      if (isDialog) removeDialog();

      callback?.({ data: user, status: 'success' });
    },
  });

  const onDelete = () => {
    _deleteMe(undefined);
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => removeDialog()} pending={isPending} />;
}
