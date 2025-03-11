import type { ContextEntity } from 'config';
import { membersKeys } from '~/modules/memberships/query';
import type { InfiniteMemberQueryData } from '~/modules/memberships/query-mutations';
import { queryClient } from '~/query/query-client';

export const getMembersTableCache = (orgIdOrSlug: string, entityType: ContextEntity) => {
  const queryKey = [...membersKeys.list(), { entityType, orgIdOrSlug }];

  const queryData = queryClient.getQueriesData<InfiniteMemberQueryData>({ queryKey });

  if (!queryData.length) return []; // Return empty array if no matching query found

  const [, cachedData] = queryData[0] ?? [];

  return cachedData?.pages?.flatMap((page) => page.items) ?? [];
};
