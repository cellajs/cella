import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import type { Label, Task } from '~/modules/common/electric/electrify';
import { sortTaskOrder } from '~/modules/projects/task/helpers';
import type { Member } from '~/types';

dayjs.extend(isBetween);

export const sortAndGetCounts = (tasks: Task[], showAccepted: boolean, showIced: boolean, table?: boolean) => {
  let acceptedCount = 0;
  let icedCount = 0;

  const filteredTasks = tasks
    .filter((task) => !task.parent_id)
    .filter((task) => {
      // Count accepted and iced tasks
      if (task.status === 6 && showAcceptedByTime(task)) acceptedCount += 1;
      if (task.status === 0) icedCount += 1;
      // Filter based on showAccepted and showIced
      if (showAccepted && showAcceptedByTime(task) && task.status === 6) return true;
      if (showIced && task.status === 0) return true;
      return task.status !== 0 && task.status !== 6;
    });

  return { sortedTasks: table ? filteredTasks : filteredTasks.sort((a, b) => sortTaskOrder(a, b)), acceptedCount, icedCount };
};

export const enhanceTasks = (tasks: Task[], labels: Label[], members: Member[]) => {
  const withSubtask = tasks
    .filter((task) => !task.parent_id)
    .map((task) => ({
      ...task,
      subTasks: tasks.filter((t) => t.parent_id === task.id).sort((a, b) => sortTaskOrder(a, b, true)),
    }));
  return withSubtask.map((task) => {
    // TODO: This is a temporary solution to get the labels and assignedTo for the tasks
    // Perhaps we should store in db as labelIds and call them labels here
    const virtualAssignedTo = task.assigned_to?.length ? members.filter((m) => task.assigned_to?.includes(m.id)) : [];
    const virtualLabels = task.labels?.length ? labels.filter((l) => task.labels?.includes(l.id)) : [];
    const virtualCreatedBy = members.find((m) => m.id === task.created_by);
    return {
      ...task,
      virtualAssignedTo,
      virtualLabels,
      virtualCreatedBy,
    };
  });
};

const showAcceptedByTime = (task: Task) => {
  const thirtyDaysAgo = dayjs().subtract(30, 'day');
  const today = dayjs();
  return dayjs(task.modified_at).isBetween(thirtyDaysAgo, today, null, '[]');
};
