import { queryOptions } from '@tanstack/react-query';
import { getWorkspace } from '~/api/workspaces';

export const workspaceQueryOptions = (idOrSlug: string, orgIdOrSlug: string) =>
  queryOptions({
    queryKey: ['workspaces', idOrSlug],
    queryFn: () => getWorkspace(idOrSlug, orgIdOrSlug),
  });
