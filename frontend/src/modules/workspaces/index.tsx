import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { getProjects } from '~/api/projects';
import { getWorkspace } from '~/api/workspaces';
import { WorkspaceRoute } from '~/routes/workspaces';
import { FocusViewContainer } from '../common/focus-view';
import { PageHeader } from '../common/page-header';
import { useWorkspaceStore } from '~/store/workspace';

export const workspaceQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: ['workspaces', idOrSlug],
    queryFn: () => getWorkspace(idOrSlug),
  });

export const workspaceProjectsQueryOptions = (workspaceId: string, organizationId: string) =>
  queryOptions({
    queryKey: ['projects', workspaceId],
    queryFn: () =>
      getProjects({
        workspaceId,
        organizationId,
      }),
    select: (data) =>
      data.items
        .filter((p) => p.membership && !p.membership.archived)
        .sort((a, b) => {
          if (a.membership === null || b.membership === null) return 0;
          return a.membership.order - b.membership.order;
        }),
  });

const WorkspacePage = () => {
  const { showPageHeader, setProjects } = useWorkspaceStore();

  const { idOrSlug } = useParams({ from: WorkspaceRoute.id });
  const workspaceQuery = useSuspenseQuery(workspaceQueryOptions(idOrSlug));
  const workspace = workspaceQuery.data;

  const projectsQuery = useSuspenseQuery(workspaceProjectsQueryOptions(workspace.id, workspace.organizationId));
  setProjects(projectsQuery.data);

  return (
    <FocusViewContainer>
      {showPageHeader && (
        <PageHeader
          type="WORKSPACE"
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
