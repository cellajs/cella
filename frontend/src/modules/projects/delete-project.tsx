import { useMutation } from '~/hooks/use-mutations';
import { queryClient } from '~/lib/router';
import { DeleteForm } from '~/modules/common/delete-form';
import { dialog } from '~/modules/common/dialoger/state';

interface Project {
  id: string;
  slug: string;
  name: string;
  organizationId: string;
  workspaceId: string;
}

interface Props {
  projects: Project[];
  callback?: (project: Project[]) => void;
  dialog?: boolean;
}

const DeleteProjects = ({ projects, callback, dialog: isDialog }: Props) => {
  const { mutate: deleteProjects, isPending } = useMutation({
    // mutationFn: baseDeleteProjects,
    onSuccess: () => {
      for (const project of projects) {
        queryClient.invalidateQueries({
          queryKey: ['Projects', project.id],
        });
      }

      callback?.(projects);

      if (isDialog) dialog.remove();
    },
  });

  const onDelete = () => {
    deleteProjects();
    // deleteProjects(projects.map((p) => p.id));
  };

  return <DeleteForm onDelete={onDelete} onCancel={() => dialog.remove()} pending={isPending} />;
};

export default DeleteProjects;
