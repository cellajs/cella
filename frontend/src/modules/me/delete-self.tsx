import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { deleteMe } from 'sdk';
import { withStepUp } from '~/modules/auth/step-up';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { userQueryKeys } from '~/modules/user/query';
import { useCurrentUser } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';

export function DeleteSelf({ dialog: isDialog }: { dialog?: boolean }) {
  const navigate = useNavigate();
  const removeDialog = useDialoger((state) => state.remove);

  const user = useCurrentUser();

  const { mutate: _deleteMe, isPending } = useMutation({
    mutationFn: async () => {
      await withStepUp(() => deleteMe());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userQueryKeys.detail.byId(user.id) });

      navigate({ to: '/auth/sign-out', replace: true, search: { force: true } });
      if (isDialog) removeDialog();
    },
  });

  const onDelete = () => {
    _deleteMe(undefined);
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => removeDialog()} pending={isPending} />;
}
