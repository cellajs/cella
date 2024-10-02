import { useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useLocation, useParams } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getOrganization } from '~/api/organizations';
import { useEventListener } from '~/hooks/use-event-listener';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageHeader } from '~/modules/common/page-header';
import { workspaceQueryOptions } from '~/modules/workspaces/helpers/query-options';
import { useUpdateWorkspaceMutation } from '~/modules/workspaces/update-workspace-form';
import { WorkspaceRoute } from '~/routes/workspaces';
import { useWorkspaceStore } from '~/store/workspace';

const WorkspacePage = () => {
  const { t } = useTranslation();
  const { showPageHeader, setSelectedTasks, setSearchQuery, setWorkspace } = useWorkspaceStore();
  const { idOrSlug, orgIdOrSlug } = useParams({ from: WorkspaceRoute.id });
  const { pathname } = useLocation();

  const workspaceData = useSuspenseQuery({
    ...workspaceQueryOptions(idOrSlug, orgIdOrSlug),
    select: (data) => {
      setWorkspace(data.workspace, data.projects, data.labels, data.members);
      return data;
    },
  }).data;
  const workspace = workspaceData.workspace;

  const isAdmin = workspace.membership?.role === 'admin';

  //TODO  try find other solution other than useMutateWorkspaceQueryData hook
  const { mutate } = useUpdateWorkspaceMutation(workspace.id, workspace.organizationId);

  useEventListener('updateEntityCover', (e) => {
    const { bannerUrl, entity } = e.detail;
    if (entity !== workspace.entity) return;
    mutate(
      { bannerUrl },
      {
        onSuccess: () => toast.success(t('common:success.upload_cover')),
        onError: () => toast.error(t('common:error.image_upload_failed')),
      },
    );
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
          isAdmin={isAdmin}
          title={workspace.name}
          thumbnailUrl={workspace.thumbnailUrl}
          bannerUrl={workspace.bannerUrl}
          parent={{ id: workspace.organizationId, fetchFunc: getOrganization }}
        />
      )}
      <div className="flex flex-col gap-2 md:gap-3 p-2 md:p-3 group/workspace">
        <Outlet />
      </div>
    </FocusViewContainer>
  );
};

export default WorkspacePage;
