import { useNavigate } from '@tanstack/react-router';
import { DeleteForm } from '~/modules/common/delete-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useDeleteSelfMutation } from '~/modules/me/query';

export function DeleteSelf() {
  const navigate = useNavigate();
  const removeDialog = useDialoger((state) => state.remove);
  const closeDialog = () => removeDialog('delete-account');

  const { mutate: deleteSelf, isPending } = useDeleteSelfMutation();

  const onDelete = () =>
    deleteSelf(undefined, {
      onSuccess: () => {
        navigate({ to: '/auth/sign-out', replace: true, search: { force: true } });
        closeDialog();
      },
    });

  return <DeleteForm onDelete={onDelete} onCancel={closeDialog} pending={isPending} />;
}
