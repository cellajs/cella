import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { useLiveQuery } from 'electric-sql/react';
import { type Dispatch, type SetStateAction, createContext, useEffect, useState } from 'react';
import { getProjects } from '~/api/projects';
import { getWorkspaceBySlugOrId } from '~/api/workspaces';
import BoardHeader from '~/modules/projects/board-header';
import { WorkspaceRoute } from '~/routes/workspaces';
import { useNavigationStore } from '~/store/navigation';
import type { Project, Workspace } from '~/types';
import { FocusViewContainer } from '../common/focus-view';
import { PageHeader } from '../common/page-header';
import { type Label, type TaskWithLabels, type TaskWithTaskLabels, useElectric } from '../common/electric/electrify';

interface WorkspaceContextValue {
  workspace: Workspace;
  projects: Project[];
  tasks: TaskWithLabels[];
  labels: Label[];
  selectedTasks: string[];
  setSelectedTasks: Dispatch<SetStateAction<string[]>>;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
}

export const WorkspaceContext = createContext({} as WorkspaceContextValue);

export const workspaceQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: ['workspaces', idOrSlug],
    queryFn: () => getWorkspaceBySlugOrId(idOrSlug),
  });

export const workspaceProjectsQueryOptions = (workspace: string) =>
  queryOptions({
    queryKey: ['workspaces', workspace, 'projects'],
    queryFn: () =>
      getProjects({
        workspace,
      }),
  });

const WorkspacePage = () => {
  const { setFocusView } = useNavigationStore();
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPageHeader, setShowPageHeader] = useState(false);

  const togglePageHeader = () => {
    if (!showPageHeader) setFocusView(false);
    setShowPageHeader(!showPageHeader);
  };

  const { idOrSlug } = useParams({ from: WorkspaceRoute.id });
  const workspaceQuery = useSuspenseQuery(workspaceQueryOptions(idOrSlug));
  const workspace = workspaceQuery.data;

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const Electric = useElectric()!;

  const projectsQuery = useSuspenseQuery(workspaceProjectsQueryOptions(workspace.id));
  const projects = projectsQuery.data.items;

  const { results: tasks = [] } = useLiveQuery(
    Electric.db.tasks.liveMany({
      where: {
        project_id: {
          in: projects.map((project) => project.id),
        },
      },
    })
  ) as { results: TaskWithTaskLabels[] };

  console.log(tasks);

  const { results: labels = [] } = useLiveQuery(
    Electric.db.labels.liveMany({
      where: {
        project_id: {
          in: projects.map((p) => p.id),
        },
      },
    }),
  );

  useEffect(() => {
    setSearchQuery('');
  }, [workspace]);

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        projects,
        tasks: tasks.map((task) => ({
          ...task,
          labels: task.task_labels?.map((tl) => tl.labels || []).flatMap((labels) => labels) || [],
        })),
        labels,
        selectedTasks,
        setSelectedTasks,
        searchQuery,
        setSearchQuery,
      }}
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
        <div className="flex flex-col gap-2 md:gap-4 p-2 md:p-4">
          <BoardHeader showPageHeader={showPageHeader} handleShowPageHeader={togglePageHeader} />
          <Outlet />
        </div>
      </FocusViewContainer>
    </WorkspaceContext.Provider>
  );
};

export default WorkspacePage;
