import { useNavigate } from '@tanstack/react-router';
import { DeleteForm } from '~/modules/common/delete-form';
import { useOverlayClose } from '~/modules/common/overlay-close';
import { useDeleteSelfMutation } from '~/modules/me/query';

export function DeleteSelf() {
  const navigate = useNavigate();
  const overlay = useOverlayClose();

  const { mutate: deleteSelf, isPending } = useDeleteSelfMutation();

  const deleteAndSignOut = () =>
    deleteSelf(undefined, {
      onSuccess: () => {
        navigate({ to: '/auth/sign-out', replace: true, search: { force: true } });
        overlay?.close();
      },
    });

  return <DeleteForm onDelete={deleteAndSignOut} pending={isPending} />;
}
