import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { createContext, useEffect, useState } from 'react';
import { getWorkspaceBySlugOrId } from '~/api/workspaces';
import type { Label, Project, Task } from '~/mocks/workspaces';
import { WorkspaceRoute } from '~/routes/workspaces';
import type { Workspace } from '~/types';
import { getLabels, getProjects, getTasks } from '~/mocks/workspaces';

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

  // TODO: move to react-query
  const [projects, setProjects] = useState<Project[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    const projects = getProjects(3);
    const labels = getLabels();
    const tasks = getTasks(projects);

    setProjects(projects);
    setLabels(labels);
    setTasks(tasks);
  }, [workspace]);

  return (
    <WorkspaceContext.Provider value={{ workspace, projects, labels, tasks }}>
      <Outlet />
    </WorkspaceContext.Provider>
  );
};

export default WorkspacePage;
