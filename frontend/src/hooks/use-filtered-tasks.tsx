import { useMemo } from 'react';
import type { Label, Task } from '~/modules/common/electric/electrify';
import { sortTaskOrder } from '~/modules/projects/task/helpers';
import type { Member } from '~/types';

const useTaskFilters = (tasks: Task[], showAccepted: boolean, showIced: boolean, labels: Label[], members: Member[]) => {
  const { showingTasks, acceptedCount, icedCount } = useMemo(() => {
    let acceptedCount = 0;
    let icedCount = 0;

    let filteredTasks = tasks
      .filter((task) => {
        // Count accepted and iced tasks
        if (task.status === 6) acceptedCount += 1;
        if (task.status === 0) icedCount += 1;
        // Filter based on showAccepted and showIced
        if (showAccepted && task.status === 6) return true;
        if (showIced && task.status === 0) return true;
        return task.status !== 0 && task.status !== 6;
      })
      .sort((a, b) => sortTaskOrder(a, b)); // Sort tasks

    filteredTasks = filteredTasks.map((task) => {
      // TODO: This is a temporary solution to get the labels and assignedTo for the tasks
      // Perhaps we should store in db as labelIds and call them labels here
      const virtualAssignedTo = task.assigned_to?.length ? members.filter((m) => task.assigned_to?.includes(m.id)) : [];
      const virtualLabels = task.labels?.length ? labels.filter((l) => task.labels?.includes(l.id)) : [];

      return {
        ...task,
        virtualAssignedTo,
        virtualLabels,
      };
    });

    return { showingTasks: filteredTasks, acceptedCount, icedCount };
  }, [tasks, showAccepted, showIced, labels, members]);

  return { showingTasks, acceptedCount, icedCount };
};

export default useTaskFilters;
