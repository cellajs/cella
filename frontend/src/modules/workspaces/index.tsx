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

  const [projects, setProjects] = useState([]);
  const [labels, setLabels] = useState([]);
  const [tasks, setTasks] = useState([]);

  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return; // Stop mock worker from running twice in Strict mode
    }

    enableMocking().then(() => {
      fetch('/mock/workspace-data')
        .then((response) => response.json())
        .then((data) => {
          console.log('Fetched MSW data:', data);
          setProjects(data.projects);
          setLabels(data.labels);
          setTasks(data.tasks);
          stopMocking(); // Ensure to stop mocking after fetching data
        })
        .catch((error) => console.error('Error fetching MSW data:', error));
    });
  }, [workspace]);

  return (
    <WorkspaceContext.Provider value={{ workspace, projects, labels, tasks }}>
      {projects && tasks && labels && <Outlet />}
    </WorkspaceContext.Provider>
  );
};

export default WorkspacePage;
