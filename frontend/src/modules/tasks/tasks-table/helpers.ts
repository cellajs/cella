import type { Task } from '~/modules/common/electric/electrify';

export const sortBy = (
  tasks: Task[],
  sort: 'project_id' | 'status' | 'created_by' | 'type' | 'modified_at' | 'created_at' | undefined,
  order: 'desc' | 'asc' | undefined,
) => {
  const sortField = sort || 'created_at';
  const sortOrder = order || 'desc';

  return tasks.sort((a, b) => {
    const valueA =
      sortField.includes('created_at') || sortField.includes('modified_at')
        ? (a[sortField as keyof Task] as Date).getTime()
        : a[sortField as keyof Task];
    const valueB =
      sortField.includes('created_at') || sortField.includes('modified_at')
        ? (b[sortField as keyof Task] as Date).getTime()
        : b[sortField as keyof Task];

    // Handle null or undefined values
    if (valueA == null || valueB == null) {
      if (valueA == null && valueB == null) return 0;
      if (valueA == null) return sortOrder === 'asc' ? -1 : 1;
      return sortOrder === 'asc' ? 1 : -1;
    }

    // Compare values based on sort order
    if (valueA < valueB) return sortOrder === 'asc' ? -1 : 1;
    if (valueA > valueB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });
};

export const filterBy = (tasks: Task[], selectedProjects: string[], selectedStatuses: number[]) => {
  return tasks.filter((task) => {
    const isProjectMatch = selectedProjects.length === 0 || selectedProjects.includes(task.project_id);
    const isStatusMatch = selectedStatuses.length === 0 || selectedStatuses.includes(task.status);

    return isProjectMatch && isStatusMatch;
  });
};
