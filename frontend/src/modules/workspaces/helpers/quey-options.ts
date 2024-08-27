import { queryOptions } from '@tanstack/react-query';
import { getLabels } from '~/api/labels';
import { getWorkspace } from '~/api/workspaces';

export const workspaceQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: ['workspaces', idOrSlug],
    queryFn: () => getWorkspace(idOrSlug),
  });

export const labelsQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: ['labels', projectId],
    queryFn: () => getLabels({ projectId }),
  });
