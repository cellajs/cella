import { infiniteQueryOptions } from '@tanstack/react-query';
import { config } from 'config';

import { type GetAttachmentsParams, getAttachments } from '~/modules/attachments/api';

// Keys for attachments queries
export const attachmentsKeys = {
  all: ['attachments'] as const,
  list: () => [...attachmentsKeys.all, 'list'] as const,
  table: (filters?: GetAttachmentsParams) => [...attachmentsKeys.list(), filters] as const,
  similar: (filters?: Pick<GetAttachmentsParams, 'orgIdOrSlug'>) => [...attachmentsKeys.list(), filters] as const,
  create: () => [...attachmentsKeys.all, 'create'] as const,
  update: () => [...attachmentsKeys.all, 'update'] as const,
  delete: () => [...attachmentsKeys.all, 'delete'] as const,
};

// Infinite Query Options to get a paginated list of attachments
export const attachmentsQueryOptions = ({
  orgIdOrSlug,
  q = '',
  sort: initialSort,
  order: initialOrder,
  limit = config.requestLimits.attachments,
}: GetAttachmentsParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  const queryKey = attachmentsKeys.table({ orgIdOrSlug, q, sort, order });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) => await getAttachments({ page, q, sort, order, limit, orgIdOrSlug, offset: page * limit }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
