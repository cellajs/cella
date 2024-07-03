import type { Project } from '~/types';
import type { Task } from '../common/electric/electrify';
import { sortTaskOrder } from '~/modules/projects/task/helpers';

// filtering and sort of projects on board
export const boardProjectFiltering = (projects: Project[]) => {
  return projects
    .filter((p) => p.membership && !p.membership.archived)
    .sort((a, b) => {
      if (a.membership === null || b.membership === null) return 0;
      return a.membership.order - b.membership.order;
    });
};

// TODO Deprecate this, filtering should be done by SQLITE. filtering and sort of projects on board
export const boardTaskFiltering = (tasks: Task[], projectId: string, projectSettings?: { expandAccepted: boolean; expandIced: boolean }) => {
  return tasks
    .filter((t) => t.project_id === projectId)
    .filter((t) => {
      if (projectSettings?.expandAccepted && t.status === 6) return true;
      if (projectSettings?.expandIced && t.status === 0) return true;
      return t.status !== 0 && t.status !== 6;
    })
    .sort((a, b) => sortTaskOrder(a, b));
};
