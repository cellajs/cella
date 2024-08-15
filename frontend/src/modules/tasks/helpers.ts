import type { Task, SubTask } from '~/types';

// To sort Tasks by its status & order
export const sortTaskOrder = (task1: Pick<Task, 'status' | 'order'>, task2: Pick<Task, 'status' | 'order'>, reverse?: boolean) => {
  if (task1.status !== task2.status) return task2.status - task1.status;
  // same status, sort by order
  if (task1.order !== null && task2.order !== null) return reverse ? task1.order - task2.order : task2.order - task1.order;
  // order is null
  return 0;
};

export const getNewTaskOrder = (status: number, tasks: Task[] | SubTask[]) => {
  const filteredTasks = tasks.filter((t) => t.status === status).sort((a, b) => b.order - a.order);
  return filteredTasks.length > 0 ? filteredTasks[0].order + 1 : 1;
};
