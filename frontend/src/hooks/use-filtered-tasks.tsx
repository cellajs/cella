import { useMemo } from 'react';
import type { Label, BaseTask } from '~/types';
import type { Member } from '~/types';
import { enhanceTasks, sortAndGetCounts } from './use-filtered-task-helpers';

const useTaskFilters = (tasks: BaseTask[], showAccepted: boolean, showIced: boolean, labels: Label[], members: Member[], table?: boolean) => {
  return useMemo(() => {
    const enhancedTasks = enhanceTasks(tasks, labels, members);
    const { sortedTasks, acceptedCount, icedCount } = sortAndGetCounts(enhancedTasks, showAccepted, showIced, table);
    return { showingTasks: sortedTasks, acceptedCount, icedCount };
  }, [tasks, showAccepted, showIced, labels, members]);
};

export default useTaskFilters;
