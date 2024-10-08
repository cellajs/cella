import { Outlet, useLocation } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getOrganization } from '~/api/organizations';
import { useEventListener } from '~/hooks/use-event-listener';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageHeader } from '~/modules/common/page-header';
import { useUpdateWorkspaceMutation } from '~/modules/workspaces/update-workspace-form';
import { useWorkspaceStore } from '~/store/workspace';
import { useWorkspaceQuery } from './use-workspace';

const WorkspacePage = () => {
  const { t } = useTranslation();
  const { showPageHeader, setSelectedTasks, setSearchQuery } = useWorkspaceStore();

  const {
    data: { workspace },
  } = useWorkspaceQuery();

  const { pathname } = useLocation();

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
