import { deleteProjects as baseDeleteProjects } from '~/api/projects';
import { useMutation } from '~/hooks/use-mutations';
import { queryClient } from '~/lib/router';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';
import type { Project } from '~/types/app';
import { useWorkspaceQuery } from '../workspaces/helpers/use-workspace';

interface Props {
  projects: Project[];
  callback?: (project: Project[]) => void;
  dialog?: boolean;
}

const DeleteProjects = ({ projects, callback, dialog: isDialog }: Props) => {
  const {
    data: { workspace },
    removeProjects,
  } = useWorkspaceQuery();

  const { mutate: deleteProjects, isPending } = useMutation({
    mutationFn: async (ids: string[]) => await baseDeleteProjects(ids, workspace.organizationId),
    onSuccess: () => {
      for (const project of projects) {
        queryClient.invalidateQueries({
          queryKey: ['projects', project.id],
        });
      }
      if (isDialog) dialog.remove();
      const deletedIds = projects.map((p) => p.id);
      removeProjects(deletedIds);
      callback?.(projects);
    },
  });

  const onDelete = () => {
    deleteProjects(projects.map((p) => p.id));
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default DeleteProjects;
