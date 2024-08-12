import type { Task, BaseTask } from '~/types';

// To sort Tasks by its status & order
export const sortTaskOrder = (task1: Pick<Task, 'status' | 'order'>, task2: Pick<Task, 'status' | 'order'>, reverse?: boolean) => {
  if (task1.status !== task2.status) return task2.status - task1.status;
  // same status, sort by order
  if (task1.order !== null && task2.order !== null) return reverse ? task1.order - task2.order : task2.order - task1.order;
  // order is null
  return 0;
};

export const getTaskOrder = (taskId: string, newStatus: string | number | null, tasks: Task[]) => {
  if (typeof newStatus !== 'number') return;
  const currentTask = tasks.find((t) => t.id === taskId);
  if (!currentTask) return;
  // Get list of tasks with new status
  const filteredTasks = tasks.filter((t) => t.status === newStatus).sort((a, b) => b.order - a.order);
  if (!filteredTasks.length) return;
  if (currentTask.status < newStatus)
    // If new status is higher set order to bottom of a list
    return filteredTasks.slice(-1)[0].order / 2;
  // If new status is lower or the same set order to top of the list
  return filteredTasks[0].order + 1;
};

export const getNewTaskOrder = (status: number, tasks: BaseTask[]) => {
  const filteredTasks = tasks.filter((t) => t.status === status).sort((a, b) => b.order - a.order);
  return filteredTasks.length > 0 ? filteredTasks[0].order + 1 : 1;
};
