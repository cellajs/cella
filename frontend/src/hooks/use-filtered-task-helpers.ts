import { recentlyUsed } from '~/lib/utils.ts';
import { sortTaskOrder } from '~/modules/tasks/helpers';
import type { Task } from '~/types';

export const sortAndGetCounts = (tasks: Task[], showAccepted: boolean, showIced: boolean) => {
  let acceptedCount = 0;
  let icedCount = 0;

  const filteredTasks = tasks.filter((task) => {
    // Count accepted in past 30 days and iced tasks
    if (task.status === 6 && recentlyUsed(task.modifiedAt, 30)) acceptedCount += 1;
    if (task.status === 0) icedCount += 1;
    // Filter based on showAccepted in past 30 days and showIced
    if (showAccepted && recentlyUsed(task.modifiedAt, 30) && task.status === 6) return true;
    if (showIced && task.status === 0) return true;
    return task.status !== 0 && task.status !== 6;
  });
  // Sort subtasks within each task by order
  const tasksWithSortedSubtasks = filteredTasks.map((task) => ({
    ...task,
    subTasks: task.subTasks.sort((a, b) => a.order - b.order),
  }));
  console.log('tasksWithSortedSubtasks:', tasksWithSortedSubtasks[0]);

  // Sort the main tasks
  const sortedTasks = tasksWithSortedSubtasks.sort((a, b) => sortTaskOrder(a, b));

  return { sortedTasks, acceptedCount, icedCount };
};
