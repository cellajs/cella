import type { Task } from '~/modules/common/electric/electrify';

// To sort Tasks by its status & order
export const sortTaskOrder = (task1: Pick<Task, 'status' | 'sort_order'>, task2: Pick<Task, 'status' | 'sort_order'>) => {
  if (task1.status !== task2.status) return task2.status - task1.status;
  // same status, sort by sort_order
  if (task1.sort_order !== null && task2.sort_order !== null) return task2.sort_order - task1.sort_order;
  // sort_order is null
  return 0;
};

export const getTaskOrder = (taskId: string, newStatus: number, tasks: Task[]) => {
  const currentTask = tasks.find((t) => t.id === taskId);
  if (!currentTask) return;
  // Get list of tasks with new status
  const filteredTasks = tasks.filter((t) => t.status === newStatus).sort((a, b) => b.sort_order - a.sort_order);

  // Handle case where there are no tasks
  if (filteredTasks.length === 0) return 1;

  // If new status is higher set order to bottom of a list
  if (currentTask.status < newStatus) return filteredTasks.slice(-1)[0].sort_order / 2;
  // If new status is lower or the same set order to top of the list
  return filteredTasks[0].sort_order + 1;
};

export const getNewTaskOrder = (status: number, tasks: Task[]) => {
  const filteredTasks = tasks.filter((t) => t.status === status).sort((a, b) => b.sort_order - a.sort_order);
  return filteredTasks.length > 0 ? filteredTasks[0].sort_order + 1 : 1;
};
