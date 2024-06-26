import type { Task } from "~/modules/common/electric/electrify";

// To sort Tasks by its status & order
export const sortTaskOrder = (task1: Pick<Task, 'status' | 'sort_order'>, task2: Pick<Task, 'status' | 'sort_order'>) => {
  if (task1.status !== task2.status) return task2.status - task1.status;
  // same status, sort by sort_order
  if (task1.sort_order !== null && task2.sort_order !== null) return task1.sort_order - task2.sort_order;
  // sort_order is null
  return 0;
};