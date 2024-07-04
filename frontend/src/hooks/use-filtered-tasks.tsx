import { useMemo } from 'react';
import type { Label, Task } from '~/modules/common/electric/electrify';
import type { Member } from '~/types';
import { sortAndGetCounts, enhanceTasks } from './use-filtered-task-helpers';

const useTaskFilters = (tasks: Task[], showAccepted: boolean, showIced: boolean, labels: Label[], members: Member[]) => {
  return useMemo(() => {
    const { sortedTasks, acceptedCount, icedCount } = sortAndGetCounts(tasks, showAccepted, showIced);
    const enhancedTasks = enhanceTasks(sortedTasks, labels, members);

    return { showingTasks: enhancedTasks, acceptedCount, icedCount };
  }, [tasks, showAccepted, showIced, labels, members]);
};

export default useTaskFilters;
