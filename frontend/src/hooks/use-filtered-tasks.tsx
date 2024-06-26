import { useMemo } from 'react';
import type { Task } from '~/modules/common/electric/electrify';
import { sortTaskOrder } from '~/modules/projects/task/helpers';

const useTaskFilters = (tasks: Task[], showAccepted: boolean, showIced: boolean) => {
  const { showingTasks, acceptedCount, icedCount } = useMemo(() => {
    let acceptedCount = 0;
    let icedCount = 0;

    const filteredTasks = tasks
      .filter((task) => {
        // Count accepted and iced tasks
        if (task.status === 6) acceptedCount += 1;
        if (task.status === 0) icedCount += 1;
        // Filter based on showAccepted and showIced
        if (showAccepted && task.status === 6) return true;
        if (showIced && task.status === 0) return true;
        return task.status !== 0 && task.status !== 6;
      })
      .filter((task) => task.parent_id === null) // Filter sub-tasks
      .sort((a, b) => sortTaskOrder(a, b)); // Sort tasks

    return { showingTasks: filteredTasks, acceptedCount, icedCount };
  }, [tasks, showAccepted, showIced]);

  return { showingTasks, acceptedCount, icedCount };
};

export default useTaskFilters;
