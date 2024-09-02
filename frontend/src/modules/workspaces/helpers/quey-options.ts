import { queryOptions } from '@tanstack/react-query';
import { getWorkspace } from '~/api/workspaces';

export const workspaceQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: ['workspaces', idOrSlug],
    queryFn: () => getWorkspace(idOrSlug),
  });
