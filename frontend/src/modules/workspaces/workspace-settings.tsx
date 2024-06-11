import { useNavigate, useParams } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { sheet } from '~/modules/common/sheeter/state';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import type { Workspace } from '~/types';
import { dialog } from '../common/dialoger/state';
import { Button } from '../ui/button';
import DeleteWorkspaces from './delete-workspace';
import UpdateWorkspaceForm from './update-workspace-form';

export const WorkspaceSettings = ({ workspace, sheet: isSheet }: { workspace: Workspace; sheet?: boolean }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { idOrSlug }: { idOrSlug: string } = useParams({ strict: false });

  const openDeleteDialog = () => {
    dialog(
      <DeleteWorkspaces
        dialog
        workspaces={[workspace]}
        callback={() => {
          if (isSheet) sheet.remove('edit-workspace');
          toast.success(t('success.delete_resource', { resource: t('common:workspace') }));
          navigate({ to: '/', replace: true });
        }}
      />,
      {
        className: 'md:max-w-xl',
        title: t('common:delete_resource', { resource: t('common:workspace').toLowerCase() }),
        text: t('common:confirm.delete_resource', { name: workspace.name, resource: t('common:workspace').toLowerCase() }),
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
                  to: '/workspace/$idOrSlug/board',
                  params: { idOrSlug: workspace.slug },
                  replace: true,
                });
              }
            }}
            sheet={isSheet}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('common:delete_resource', { resource: t('common:workspace').toLowerCase() })}</CardTitle>
          <CardDescription>
            <Trans i18nKey={'common:delete_resource_notice.text'} values={{ name: workspace.name, resource: t('common:workspace').toLowerCase() }} />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" className="w-full sm:w-auto" onClick={openDeleteDialog}>
            <Trash2 className="mr-2 h-4 w-4" />
            <span>{t('common:delete_resource', { resource: t('common:workspace').toLowerCase() })}</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
