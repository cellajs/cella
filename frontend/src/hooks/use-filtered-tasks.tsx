import { useMemo } from 'react';
import type { Label, Task } from '~/modules/common/electric/electrify';
import { sortTaskOrder } from '~/modules/projects/task/helpers';

const useTaskFilters = (tasks: Task[], showAccepted: boolean, showIced: boolean, labels: Label[]) => {
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
        task.virtualLabels = [];
        
        if (!task.labels?.length) return task;
      
        // TODO: This is a temporary solution to get the labels for the tasks
        // Perhaps we should store in db as labelIds and call them labels here
        task.virtualLabels = labels.filter((l) => task.labels?.includes(l.id));
        return task;
      });

    return { showingTasks: filteredTasks, acceptedCount, icedCount };
  }, [tasks, showAccepted, showIced]);

  return { showingTasks, acceptedCount, icedCount };
};

export default useTaskFilters;
