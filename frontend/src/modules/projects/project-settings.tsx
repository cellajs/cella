import { Trash2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useMutateWorkSpaceQueryData } from '~/hooks/use-mutate-query-data';
import { sheet } from '~/modules/common/sheeter/state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import type { Project } from '~/types';
import { dialog } from '../common/dialoger/state';
import { Button } from '../ui/button';
import DeleteProjects from './delete-projects';
import UpdateProjectForm from './update-project-form';
import { useWorkspaceStore } from '~/store/workspace';

export const ProjectSettings = ({ sheet: isSheet, project }: { sheet?: boolean; project: Project }) => {
  const { t } = useTranslation();
  const { workspace } = useWorkspaceStore();
  const callback = useMutateWorkSpaceQueryData(['workspaces', workspace.slug]);

  const openDeleteDialog = () => {
    dialog(
      <DeleteProjects
        dialog
        projects={[project]}
        callback={(projects) => {
          // callback(projects, 'delete');
          callback(projects, 'deleteProject');
          toast.success(t('common:success.delete_resource', { resource: t('common:project') }));
          sheet.remove('edit-project');
        }}
      />,
      {
        className: 'md:max-w-xl',
        title: t('common:delete_resource', { resource: t('common:project').toLowerCase() }),
        text: t('common:confirm.delete_resource', { name: project.name, resource: t('common:project').toLowerCase() }),
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
          <CardTitle>{t('common:delete_resource', { resource: t('common:project').toLowerCase() })}</CardTitle>
          <CardDescription>
            <Trans i18nKey="common:delete_resource_notice.text" values={{ name: project.name, resource: t('common:project').toLowerCase() }} />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" className="w-full sm:w-auto" onClick={openDeleteDialog}>
            <Trash2 className="mr-2 h-4 w-4" />
            <span>{t('common:delete_resource', { resource: t('common:project').toLowerCase() })}</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
