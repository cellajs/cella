import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { createContext, useEffect, useState } from 'react';
import { getWorkspaceBySlugOrId } from '~/api/workspaces';
import type { Label } from '~/mocks/workspaces';
import { WorkspaceRoute } from '~/routes/workspaces';
import type { Workspace } from '~/types';
import { type Project, useElectric, type Task } from '../common/root/electric';
import { useLiveQuery } from 'electric-sql/react';

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
    <WorkspaceContext.Provider value={{ workspace, projects, labels, tasks }}>
      <Outlet />
    </WorkspaceContext.Provider>
  );
};

export default WorkspacePage;
