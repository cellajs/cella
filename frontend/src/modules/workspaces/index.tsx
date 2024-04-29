import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { createContext, useEffect, useRef, useState } from 'react';
import { getWorkspaceBySlugOrId } from '~/api/workspaces';
import { enableMocking, stopMocking } from '~/mocks/browser';
import type { Label, Project, Task } from '~/mocks/dataGeneration';
import { WorkspaceRoute } from '~/routes/workspaces';
import type { Workspace } from '~/types';

interface WorkspaceContextValue {
  workspace: Workspace;
  projects: Project[];
  labels: Label[];
  tasks: Task[];
  updateTasks: (task: Task) => void;
}

export const WorkspaceContext = createContext({} as WorkspaceContextValue);

export const workspaceQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: ['workspaces', idOrSlug],
    queryFn: () => getWorkspaceBySlugOrId(idOrSlug),
  });

const WorkspacePage = () => {
  const { idOrSlug } = useParams({ from: WorkspaceRoute.id });
  const workspaceQuery = useSuspenseQuery(workspaceQueryOptions(idOrSlug));
  const workspace = workspaceQuery.data;

  // TODO: move to react-query
  const [projects, setProjects] = useState<Project[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const isInitialMount = useRef(true);

  const updateTasks = (task: Task) => {
    if (!task) return;

    // Add new task
    if (!tasks.find((t) => t.id === task.id)) {
      const updatedTasks = [...tasks, task]
      return setTasks(updatedTasks.sort((a, b) => b.status - a.status));
    }
    // Update existing task
    const updatedTasks = tasks.map((t: Task) => {
      if (t.id !== task.id) return t;
      return { ...t, ...task };
    });

    setTasks(updatedTasks.sort((a, b) => b.status - a.status));
  };

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return; // Stop mock worker from running twice in Strict mode
    }

    enableMocking().then(() => {
      fetch('/mock/workspace-data')
        .then((response) => response.json())
        .then((data) => {
          setProjects(data.projects);
          setLabels(data.labels);
          setTasks(data.tasks);
          stopMocking(); // Ensure to stop mocking after fetching data
        })
        .catch((error) => console.error('Error fetching MSW data:', error));
    });
  }, [workspace]);

  return (
    <WorkspaceContext.Provider value={{ workspace, projects, labels, tasks, updateTasks }}>
      <Outlet />
    </WorkspaceContext.Provider>
  );
};

export default WorkspacePage;
