import { infiniteQueryOptions } from '@tanstack/react-query';
import { config } from 'config';

import { type GetAttachmentsParams, getAttachments } from '~/modules/attachments/api';
import { getOffset } from '~/query/helpers';

/**
 * Keys for attachments related queries. These keys help to uniquely identify different query.
 * For managing query caching and invalidation.
 */
export const attachmentsKeys = {
  all: ['attachments'] as const,
  list: () => [...attachmentsKeys.all, 'list'] as const,
  table: (filters?: GetAttachmentsParams) => [...attachmentsKeys.list(), filters] as const,
  similar: (filters?: Pick<GetAttachmentsParams, 'orgIdOrSlug'>) => [...attachmentsKeys.list(), filters] as const,
  create: () => [...attachmentsKeys.all, 'create'] as const,
  update: () => [...attachmentsKeys.all, 'update'] as const,
  delete: () => [...attachmentsKeys.all, 'delete'] as const,
};

/**
 * Infinite Query Options for fetching a paginated list of attachments.
 *
 * This function returns the configuration for querying attachments from target organization with pagination support.
 *
 * @param param.orgIdOrSlug - Organization ID or slug.
 * @param param.q - Optional search query for filtering attachments.
 * @param param.sort - Field to sort by (default: 'createdAt').
 * @param param.order - Order of sorting (default: 'desc').
 * @param param.limit - Number of items per page (default: `config.requestLimits.attachments`).
 * @returns Infinite query options.
 */
export const attachmentsQueryOptions = ({
  orgIdOrSlug,
  q = '',
  sort: initialSort,
  order: initialOrder,
  groupId,
  limit = config.requestLimits.attachments,
}: GetAttachmentsParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  const queryKey = attachmentsKeys.table({ orgIdOrSlug, q, sort, order, groupId });

  const offset = getOffset(queryKey);

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: 0,
    queryFn: async ({ pageParam: page, signal }) => await getAttachments({ page, q, sort, order, limit, groupId, orgIdOrSlug, offset }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
