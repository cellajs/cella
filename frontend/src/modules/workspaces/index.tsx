import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { getProjects } from '~/api/projects';
import { getWorkspace } from '~/api/workspaces';
import { WorkspaceRoute } from '~/routes/workspaces';
import { useNavigationStore } from '~/store/navigation';
import { FocusViewContainer } from '../common/focus-view';
import { PageHeader } from '../common/page-header';
import { WorkspaceProvider } from './workspace-context';

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
  });

const WorkspacePage = () => {
  const { setFocusView } = useNavigationStore();

  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPageHeader, setShowPageHeader] = useState(false);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);

  const { idOrSlug } = useParams({ from: WorkspaceRoute.id });
  const workspaceQuery = useSuspenseQuery(workspaceQueryOptions(idOrSlug));
  const workspace = workspaceQuery.data;

  const projectsQuery = useSuspenseQuery(workspaceProjectsQueryOptions(workspace.id, workspace.organizationId));
  const projects = projectsQuery.data.items;

  const togglePageHeader = () => {
    if (!showPageHeader) setFocusView(false);
    setShowPageHeader(!showPageHeader);
  };

  useEffect(() => {
    setSearchQuery('');
  }, [workspace]);
  return (
    <WorkspaceProvider
      workspace={workspace}
      projects={projects}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      selectedTasks={selectedTasks}
      setSelectedTasks={setSelectedTasks}
      focusedTaskId={focusedTaskId}
      setFocusedTaskId={setFocusedTaskId}
      showPageHeader={showPageHeader}
      togglePageHeader={togglePageHeader}
    >
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
      <FocusViewContainer>
        <div className="flex flex-col gap-2 md:gap-3 p-2 md:p-3 group/workspace">
          <Outlet />
        </div>
      </FocusViewContainer>
    </WorkspaceProvider>
  );
};

export default WorkspacePage;
