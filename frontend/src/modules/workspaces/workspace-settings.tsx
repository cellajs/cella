import { useNavigate, useParams } from '@tanstack/react-router';
import { Trans, useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import UpdateWorkspaceForm from './update-workspace-form';
import { Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import DeleteWorkspaces from './delete-workspace';
import { dialog } from '../common/dialoger/state';
import { workspaceQueryOptions } from './workspace';
import { useSuspenseQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { sheet } from '~/modules/common/sheeter/state';

export const WorkspaceSettings = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { idOrSlug }: { idOrSlug: string } = useParams({ strict: false });

  const workspaceQuery = useSuspenseQuery(workspaceQueryOptions(idOrSlug));
  const workspace = workspaceQuery.data;

  const openDeleteDialog = () => {
    dialog(
      <DeleteWorkspaces
        dialog
        workspaces={[workspace]}
        callback={() => {
          toast.success(t('common:success.delete_workspace'));
          sheet.remove('workspace_settings');
          navigate({ to: '/', replace: true });
        }}
      />,
      {
        className: 'md:max-w-xl',
        title: t('common:delete_workspace'),
        text: t('common:confirm.delete_workspace', { name: workspace.name }),
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
            callback={(workspace) => {
              if (idOrSlug !== workspace.slug) {
                navigate({
                  to: '/workspace/$idOrSlug/projects',
                  params: { idOrSlug: workspace.slug },
                  replace: true,
                });
              }
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('common:delete_workspace')}</CardTitle>
          <CardDescription>
            <Trans i18nKey="common:delete_workspace_notice.text" values={{ name: workspace.name }} />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" className="w-full sm:w-auto" onClick={openDeleteDialog}>
            <Trash2 className="mr-2 h-4 w-4" />
            <span>{t('common:delete_workspace')}</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
