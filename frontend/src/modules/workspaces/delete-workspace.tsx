import { deleteWorkspaces as baseDeleteWorkspaces } from '~/api/workspaces';

import { useMutation } from '~/hooks/use-mutations';
import { queryClient } from '~/lib/router';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import type { Workspace } from '~/types';

interface Props {
  workspaces: Workspace[];
  callback?: (workspace: Workspace[]) => void;
  dialog?: boolean;
}

const DeleteWorkspaces = ({ workspaces, callback, dialog: isDialog }: Props) => {
  const { mutate: deleteWorkspaces, isPending } = useMutation({
    mutationFn: baseDeleteWorkspaces,
    onSuccess: () => {
      for (const workspace of workspaces) {
        queryClient.invalidateQueries({
          queryKey: ['workspaces', workspace.id],
        });
      }

      callback?.(workspaces);

      if (isDialog) dialog.remove();
    },
  });

  const onDelete = () => {
    deleteWorkspaces(workspaces.map((workspace) => workspace.id));
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default DeleteWorkspaces;
