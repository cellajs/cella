import { Trash2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMutateWorkSpaceQueryData } from '~/hooks/use-mutate-query-data';
import { dialog } from '~/modules/common/dialoger/state';
import { sheet } from '~/modules/common/sheeter/state';
import DeleteProjects from '~/modules/projects/delete-projects';
import UpdateProjectForm from '~/modules/projects/update-project-form';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import type { Project } from '~/types/app';
import { useWorkspaceQuery } from '../workspaces/helpers/use-workspace';

export const ProjectSettings = ({ sheet: isSheet, project }: { sheet?: boolean; project: Project }) => {
  const { t } = useTranslation();
  const {
    data: { workspace },
  } = useWorkspaceQuery();
  const callback = useMutateWorkSpaceQueryData(['workspaces', workspace.slug]);

  const openDeleteDialog = () => {
    dialog(
      <DeleteProjects
        dialog
        projects={[project]}
        callback={(projects) => {
          toast.success(t('common:success.delete_resource', { resource: t('app:project') }));
          sheet.remove('edit-project');
          callback(projects, 'deleteProject');
        }}
      />,
      {
        className: 'md:max-w-xl',
        title: t('common:delete_resource', { resource: t('app:project').toLowerCase() }),
        description: t('common:confirm.delete_resource', { name: project.name, resource: t('app:project').toLowerCase() }),
      },
    );
  };
  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>{t('common:general')}</CardTitle>
        </CardHeader>
        <CardContent>
          <UpdateProjectForm project={project} callback={(project) => callback([project], 'updateProject')} sheet={isSheet} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('common:delete_resource', { resource: t('app:project').toLowerCase() })}</CardTitle>
          <CardDescription>
            <Trans i18nKey="common:delete_resource_notice.text" values={{ name: project.name, resource: t('app:project').toLowerCase() }} />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" className="w-full sm:w-auto" onClick={openDeleteDialog}>
            <Trash2 className="mr-2 h-4 w-4" />
            <span>{t('common:delete_resource', { resource: t('app:project').toLowerCase() })}</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
