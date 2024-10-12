import { useNavigate, useParams } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { useMutateWorkSpaceQueryData } from '~/hooks/use-mutate-query-data';
import { dialog } from '~/modules/common/dialoger/state';
import { sheet } from '~/modules/common/sheeter/state';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import DeleteWorkspaces from '~/modules/workspaces/delete-workspace';
import UpdateWorkspaceForm from '~/modules/workspaces/update-workspace-form';
import { useWorkspaceQuery } from './helpers/use-workspace';

export const WorkspaceSettings = ({ sheet: isSheet }: { sheet?: boolean }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const {
    data: { workspace },
    updateWorkspace,
  } = useWorkspaceQuery();

  const { idOrSlug }: { idOrSlug: string } = useParams({ strict: false });
  const callback = useMutateWorkSpaceQueryData(['workspaces', workspace.slug]);

  const openDeleteDialog = () => {
    dialog(
      <DeleteWorkspaces
        dialog
        workspaces={[workspace]}
        callback={() => {
          if (isSheet) sheet.remove('edit-workspace');
          toast.success(t('success.delete_resource', { resource: t('app:workspace') }));
          navigate({ to: '.', replace: true });
        }}
      />,
      {
        className: 'md:max-w-xl',
        title: t('common:delete_resource', { resource: t('app:workspace').toLowerCase() }),
        description: t('common:confirm.delete_resource', { name: workspace.name, resource: t('app:workspace').toLowerCase() }),
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
          <UpdateWorkspaceForm
            workspace={workspace}
            callback={(updatedWorkspace) => {
              updateWorkspace(updatedWorkspace);

              if (idOrSlug !== updatedWorkspace.slug) {
                navigate({
                  to: '/$orgIdOrSlug/workspaces/$idOrSlug/board',
                  params: { idOrSlug: updatedWorkspace.slug, orgIdOrSlug: updatedWorkspace.organizationId },
                  replace: true,
                });
              }
              callback([updatedWorkspace], 'updateWorkspace');
            }}
            sheet={isSheet}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('common:delete_resource', { resource: t('app:workspace').toLowerCase() })}</CardTitle>
          <CardDescription>
            <Trans i18nKey={'app:delete_workspace_notice.text'} values={{ name: workspace.name, resource: t('app:workspace').toLowerCase() }} />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" className="w-full sm:w-auto" onClick={openDeleteDialog}>
            <Trash2 className="mr-2 h-4 w-4" />
            <span>{t('common:delete_resource', { resource: t('app:workspace').toLowerCase() })}</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
