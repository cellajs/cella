import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useNavigate, useParams } from '@tanstack/react-router';
import { createContext, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { getWorkspaceBySlugOrId } from '~/api/workspaces';
import type { Label } from '~/mocks/workspaces';
import { WorkspaceRoute } from '~/routes/workspaces';
import type { Workspace } from '~/types';
import { type Project, useElectric, type Task } from '../common/root/electric';
import { useLiveQuery } from 'electric-sql/react';
import BoardHeader from '~/modules/projects/board-header';
import { PageHeader } from '../common/page-header';
import { useNavigationStore } from '~/store/navigation';
import { organizationQueryOptions } from '../organizations/organization';
import { ChevronRight } from 'lucide-react';

interface WorkspaceContextValue {
  workspace: Workspace;
  projects: Project[];
  labels: Label[];
  tasks: Task[];
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
  const navigate = useNavigate();
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

  const organizationQuery = useSuspenseQuery(organizationQueryOptions(workspace.organizationId));
  const organization = organizationQuery.data;

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const { db } = useElectric()!;

  const { results: projects = [] } = useLiveQuery(
    db.projects.liveMany({
      where: { workspace_id: workspace.id },
    }),
  );

  const { results: tasks = [] } = useLiveQuery(
    db.tasks.liveMany({
      where: {
        project_id: {
          in: projects.map((project) => project.id),
        },
      },
    }),
  );

  // TODO: move to react-query
  // const [projects, setProjects] = useState<Project[]>([]);
  const [labels] = useState<Label[]>([]);
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
    <WorkspaceContext.Provider value={{ workspace, projects, labels, tasks, selectedTasks, setSelectedTasks, searchQuery, setSearchQuery }}>
      {showPageHeader && (
        <PageHeader
          type="WORKSPACE"
          id={workspace.id}
          title={workspace.name}
          thumbnailUrl={workspace.thumbnailUrl}
          bannerUrl={workspace.bannerUrl}
          breadcrumbContent={
            <>
              <button type="button" className="hover:opacity-70" onClick={() => navigate({ to: `/${organization.slug}/` })}>
                {organization.name}
              </button>
              <ChevronRight size={16} />
              <strong>Workspace</strong>
            </>
          }
        />
      )}

      <div className="flex flex-col gap-2 md:gap-4 p-2 md:p-4">
        <BoardHeader showPageHeader={showPageHeader} handleShowPageHeader={togglePageHeader} />
        <Outlet />
      </div>
      <Outlet />
    </WorkspaceContext.Provider>
  );
};

export default WorkspacePage;
