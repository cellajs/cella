import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { useLiveQuery } from 'electric-sql/react';
import { type Dispatch, type SetStateAction, createContext, useEffect, useState } from 'react';
import { getWorkspaceBySlugOrId } from '~/api/workspaces';
import BoardHeader from '~/modules/projects/board-header';
import { WorkspaceRoute } from '~/routes/workspaces';
import { useNavigationStore } from '~/store/navigation';
import type { Workspace } from '~/types';
import { PageHeader } from '../common/page-header';
import { type TaskWithTaskLabels, useElectric, type ProjectWithLabels, type TaskWithLabels } from '../common/root/electric';
import { FocusViewContainer } from '../common/focus-view';

interface WorkspaceContextValue {
  workspace: Workspace;
  projects: ProjectWithLabels[];
  tasks: TaskWithLabels[];
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
  const { db } = useElectric()!;

  const { results: projects = [] } = useLiveQuery(
    db.projects.liveMany({
      where: { workspace_id: workspace.id },
      include: { labels: true },
    }),
  );

  const { results: tasks = [] } = useLiveQuery(
    db.tasks.liveMany({
      where: {
        project_id: {
          in: projects.map((project) => project.id),
        },
      },
      include: {
        task_labels: {
          include: {
            labels: true,
          },
        },
      },
    }),
  ) as { results: TaskWithTaskLabels[] };

  // const [projects, setProjects] = useState<Project[]>([]);
  // const [tasks, setTasks] = useState<Task[]>([]);

  // const updateTasks = (task: Task) => {
  //   if (!task) return;

  //   // Add new task
  //   if (!tasks.find((t) => t.id === task.id)) {
  //     const updatedTasks = [...tasks, task];
  //     return setTasks(updatedTasks.sort((a, b) => b.status - a.status));
  //   }
  //   // Update existing task
  //   const updatedTasks = tasks.map((t: Task) => {
  //     if (t.id !== task.id) return t;
  //     return { ...t, ...task };
  //   });
  //   setTasks(updatedTasks.sort((a, b) => b.status - a.status));
  // };

  useEffect(() => {
    setSearchQuery('');
    // fetch('/mock/workspace-data')
    //   .then((response) => response.json())
    //   .then((data) => {
    //     setProjects(data.projects);
    //     setLabels(data.labels);
    //     setTasks(data.tasks);
    //   })
    //   .catch((error) => console.error('Error fetching MSW data:', error));
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
