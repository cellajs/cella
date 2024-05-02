import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { createContext, useEffect, useState } from 'react';
import { getWorkspaceBySlugOrId } from '~/api/workspaces';
import type { Label, Project, Task } from '~/mocks/workspaces';
import { WorkspaceRoute } from '~/routes/workspaces';
import type { Workspace } from '~/types';
import { getLabels, getProjects, getTasks } from '~/mocks/workspaces';
import type { TaskStatus } from '../projects/task-form';

interface WorkspaceContextValue {
  workspace: Workspace;
  projects: Project[];
  labels: Label[];
  tasks: Task[];
  updateTasks: (task: Task, isNew?: boolean, toStatus?: TaskStatus) => void;
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

  const updateTasks = (task: Task, isNew = false, toStatus?: TaskStatus) => {
    if (!task) return;

    // The first task in the project column with matching status

    // Add new task
    if (isNew) {
      setTasks((currentTasks) => {
        const newTasks = [...currentTasks];
        const statusIndex = tasks.findIndex((t) => t.status === toStatus && t.projectId === task.projectId);
        newTasks.splice(statusIndex, 0, task);
        return newTasks;
      });
    }

    // Reposition existing task on status change
    if (toStatus) {
      return setTasks((currentTasks) => {
        const newTasks = [...currentTasks];
        const oldIndex = currentTasks.findIndex((t: Task) => t.id === task.id);
        newTasks.splice(oldIndex, 1);

        // TODO if status is higher than the current status, add it to the end
      //   return tasks.reduce((lastIndex, currentTask, index) => {
      //     return (currentTask.status === toStatus && currentTask.projectId === task.projectId) ? index : lastIndex;
      // }, -1);


        const statusIndex = tasks.findIndex((t) => t.status === toStatus && t.projectId === task.projectId);
        newTasks.splice(statusIndex, 0, task);
        return newTasks;
      });
    }

    // Update existing task for other mutations
    return setTasks((currentTasks) => {
      const newTasks = [...currentTasks];
      return newTasks.map((t: Task) => {
        if (t.id !== task.id) return t;
        return { ...t, ...task };
      });
    });
  };

  useEffect(() => {
    const projects = getProjects(3);
    const labels = getLabels();
    const tasks = getTasks(projects);

    setProjects(projects);
    setLabels(labels);
    setTasks(tasks);
  }, [workspace]);

  return (
    <WorkspaceContext.Provider value={{ workspace, projects, labels, tasks, updateTasks }}>
      <Outlet />
    </WorkspaceContext.Provider>
  );
};

export default WorkspacePage;
