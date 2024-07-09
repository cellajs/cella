import { useMemo } from 'react';
import type { Label, Task } from '~/modules/common/electric/electrify';
import type { Member } from '~/types';
import { enhanceTasks, sortAndGetCounts } from './use-filtered-task-helpers';

const useTaskFilters = (tasks: Task[], showAccepted: boolean, showIced: boolean, labels: Label[], members: Member[]) => {
  return useMemo(() => {
    const enhancedTasks = enhanceTasks(tasks, labels, members);
    const { sortedTasks, acceptedCount, icedCount } = sortAndGetCounts(enhancedTasks, showAccepted, showIced);
    return { showingTasks: sortedTasks, acceptedCount, icedCount };
  }, [tasks, showAccepted, showIced, labels, members]);
};

export default useTaskFilters;
