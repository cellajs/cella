import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useLocation, useParams } from '@tanstack/react-router';
import { useEffect } from 'react';
import { getLabels } from '~/api/labels';
import { getWorkspace } from '~/api/workspaces';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { PageHeader } from '~/modules/common/page-header';
import { WorkspaceRoute } from '~/routes/workspaces';
import { useWorkspaceStore } from '~/store/workspace';

export const workspaceQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: ['workspaces', idOrSlug],
    queryFn: () => getWorkspace(idOrSlug),
  });

export const labelsQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ['labels', projectId],
    queryFn: () => getLabels({ projectId }),
  });

const WorkspacePage = () => {
  const { showPageHeader, setWorkspace, setProjects, setLabels, setSelectedTasks, setSearchQuery } = useWorkspaceStore();

  const { idOrSlug } = useParams({ from: WorkspaceRoute.id });
  const { pathname } = useLocation();
  const workspaceQuery = useSuspenseQuery(workspaceQueryOptions(idOrSlug));
  const workspace = workspaceQuery.data.workspace;
  const projects = workspaceQuery.data.projects;
  //TODO find other solution other than useMutateWorkspaceQueryData hook
  setWorkspace(workspace);
  setProjects(projects);

  const labelsQuery = useSuspenseQuery(labelsQueryOptions(projects.map((p) => p.id).join('_')));
  setLabels(labelsQuery.data.items);
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
