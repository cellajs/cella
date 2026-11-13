import { getTools } from '~/lib/placements';
import { meInvitationsQueryOptions } from '~/modules/me/query';
import { queryClient } from '~/query/query-client';

/** Holds the home page until its parts are in: it renders whole and centers once. The router's pending spinner covers a slow load. */
export async function homeLoader(): Promise<void> {
  await Promise.all([
    queryClient.query({ ...meInvitationsQueryOptions(), staleTime: 'static' }).catch(() => {}),
    ...getTools('home.sections').map((tool) => tool.preload?.().catch(() => {})),
  ]);
}
