import { useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useLocation, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useEventListener } from '~/hooks/use-event-listener';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageHeader } from '~/modules/common/page-header';
import { useUpdateWorkspaceMutation } from '~/modules/workspaces/update-workspace-form';
import { WorkspaceRoute } from '~/routes/workspaces';
import { useWorkspaceStore } from '~/store/workspace';
import { labelsQueryOptions, workspaceQueryOptions } from './helpers/quey-options';

const WorkspacePage = () => {
  const { t } = useTranslation();
  const { showPageHeader, setWorkspace, setProjects, setLabels, setSelectedTasks, setSearchQuery } = useWorkspaceStore();
  const { idOrSlug } = useParams({ from: WorkspaceRoute.id });
  const { pathname } = useLocation();
  const workspaceQuery = useSuspenseQuery(workspaceQueryOptions(idOrSlug));
  const [workspace, setQueryWorkspace] = useState(workspaceQuery.data.workspace);
  const projects = workspaceQuery.data.projects;
  const labelsQuery = useSuspenseQuery(labelsQueryOptions(projects.map((p) => p.id).join('_')));

  //TODO  try find other solution other than useMutateWorkspaceQueryData hook
  setWorkspace(workspace);
  setProjects(projects);
  setLabels(labelsQuery.data.items);

  const { mutate } = useUpdateWorkspaceMutation(workspace.id);
  useEventListener('updateWorkspaceCover', (e) => {
    const banner = { bannerUrl: e.detail };
    mutate(banner, {
      onSuccess: () => {
        toast.success(t('common:success.upload_cover'));
        setQueryWorkspace((prev) => {
          return { ...prev, ...banner };
        });
        setWorkspace({ ...workspace, ...banner });
      },
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
