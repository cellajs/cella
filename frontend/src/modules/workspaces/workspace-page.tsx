import { useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useLocation, useParams } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useEventListener } from '~/hooks/use-event-listener';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageHeader } from '~/modules/common/page-header';
import { workspaceQueryOptions } from '~/modules/workspaces/helpers/quey-options';
import { useUpdateWorkspaceMutation } from '~/modules/workspaces/update-workspace-form';
import { WorkspaceRoute } from '~/routes/workspaces';
import { useWorkspaceStore } from '~/store/workspace';

const WorkspacePage = () => {
  const { t } = useTranslation();
  const { showPageHeader, setSelectedTasks, setSearchQuery } = useWorkspaceStore();
  const { idOrSlug } = useParams({ from: WorkspaceRoute.id });
  const { pathname } = useLocation();

  const workspaceData = useSuspenseQuery(workspaceQueryOptions(idOrSlug)).data;
  const workspace = workspaceData.workspace;

  //TODO  try find other solution other than useMutateWorkspaceQueryData hook
  const { mutate } = useUpdateWorkspaceMutation(workspace.id);

  useEventListener('updateWorkspaceCover', (e) => {
    const banner = { bannerUrl: e.detail };
    mutate(banner, {
      onSuccess: () => toast.success(t('common:success.upload_cover')),
      onError: () => toast.error(t('common:error.image_upload_failed')),
    });
  });

  useEffect(() => {
    setSearchQuery('');
    setSelectedTasks([]);
  }, [pathname]);

  return (
    <FocusViewContainer>
      {showPageHeader && (
        <PageHeader
          type="workspace"
          id={workspace.id}
          title={workspace.name}
          thumbnailUrl={workspace.thumbnailUrl}
          bannerUrl={workspace.bannerUrl}
          organizationId={workspace.organizationId}
        />
      )}
      <div className="flex flex-col gap-2 md:gap-3 p-2 md:p-3 group/workspace">
        <Outlet />
      </div>
    </FocusViewContainer>
  );
};

export default WorkspacePage;
