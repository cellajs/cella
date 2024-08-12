import { recentlyUsed } from '~/lib/utils.ts';
import { sortTaskOrder } from '~/modules/tasks/helpers';
import type { Label, Member, Task, BaseTask } from '~/types';

export const sortAndGetCounts = (tasks: Task[], showAccepted: boolean, showIced: boolean, table?: boolean) => {
  let acceptedCount = 0;
  let icedCount = 0;

  const filteredTasks = tasks
    .filter((task) => !task.parentId)
    .filter((task) => {
      // Count accepted in past 30 days and iced tasks
      if (task.status === 6 && recentlyUsed(task.modifiedAt, 30)) acceptedCount += 1;
      if (task.status === 0) icedCount += 1;
      // Filter based on showAccepted in past 30 days and showIced
      if (showAccepted && recentlyUsed(task.modifiedAt, 30) && task.status === 6) return true;
      if (showIced && task.status === 0) return true;
      return task.status !== 0 && task.status !== 6;
    });

  return { sortedTasks: table ? filteredTasks : filteredTasks.sort((a, b) => sortTaskOrder(a, b)), acceptedCount, icedCount };
};

export const enhanceTasks = (tasks: BaseTask[], labels: Label[], members: Member[]): Task[] => {
  const withSubtask = tasks
    .filter((task) => !task.parentId)
    .map((task) => ({
      ...task,
      subTasks: tasks.filter((t) => t.parentId === task.id).sort((a, b) => a.order - b.order),
    }));
  return withSubtask.map((task) => {
    // TODO: This is a temporary solution to get the labels and assignedTo for the tasks
    // Perhaps we should store in db as labelIds and call them labels here
    const virtualAssignedTo = task.assignedTo?.length ? members.filter((m) => task.assignedTo?.includes(m.id)) : [];
    const virtualLabels = task.labels?.length ? labels.filter((l) => task.labels?.includes(l.id)) : [];
    const virtualCreatedBy = members.find((m) => m.id === task.createdBy);
    const virtualUpdatedBy = members.find((m) => m.id === task.modifiedBy);
    return {
      ...task,
      virtualAssignedTo,
      virtualLabels,
      virtualCreatedBy,
      virtualUpdatedBy,
    };
  });
};
