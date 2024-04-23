import { useNavigate, useParams } from '@tanstack/react-router';
import { Trans, useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import Sticky from 'react-sticky-el';
import { AsideNav } from '~/modules/common/aside-nav';
import { AsideAnchor } from '../common/aside-anchor';
import UpdateWorkspaceForm from './update-workspace-form';
import { Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import DeleteWorkspaces from './delete-workspace';
import { dialog } from '../common/dialoger/state';
import { workspaceQueryOptions } from './workspace';
import { useSuspenseQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { sheet } from '~/modules/common/sheeter/state';

const tabs = [
  { id: 'general', label: 'common:general' },
  { id: 'delete-workspace', label: 'common:delete_workspace' },
];

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
    <div className="md:flex md:flex-row mx-auto mt-4 max-w-[1200px] gap-4">
      <div className="mx-auto md:min-w-[200px] md:w-[30%] flex h-auto flex-col">
        <Sticky topOffset={-60} stickyClassName="md:mt-[60px] z-10 max-md:!relative">
          <AsideNav tabs={tabs} className="pb-2" />
        </Sticky>
      </div>

      <div className="md:w-[100%] flex flex-col gap-8">
        <AsideAnchor id="general">
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
        </AsideAnchor>
        <AsideAnchor id="delete-workspace">
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
        </AsideAnchor>
      </div>
    </div>
  );
};
