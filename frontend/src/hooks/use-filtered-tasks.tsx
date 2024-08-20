import { useMemo } from 'react';
import type { Task } from '~/types';
import { sortAndGetCounts } from './use-filtered-task-helpers';

const useTaskFilters = (tasks: Task[], showAccepted: boolean, showIced: boolean) => {
  return useMemo(() => {
    const { sortedTasks, acceptedCount, icedCount } = sortAndGetCounts(tasks, showAccepted, showIced);
    return { showingTasks: sortedTasks, acceptedCount, icedCount };
  }, [tasks, showAccepted, showIced]);
};

export default useTaskFilters;
