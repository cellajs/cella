import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { config } from 'config';

import { type GetAttachmentsParams, getAttachments } from '~/modules/attachments/api';

/**
 * Keys for attachments related queries. These keys help to uniquely identify different query.
 * For managing query caching and invalidation.
 */
export const attachmentsKeys = {
  all: ['attachments'] as const,
  list: {
    base: () => [...attachmentsKeys.all, 'list'] as const,
    table: (filters: GetAttachmentsParams) => [...attachmentsKeys.list.base(), 'table', filters] as const,
    similarTable: (filters: Pick<GetAttachmentsParams, 'orgIdOrSlug'>) => [...attachmentsKeys.list.base(), 'table', filters] as const,
  },
  create: () => [...attachmentsKeys.all, 'create'] as const,
  update: () => [...attachmentsKeys.all, 'update'] as const,
  delete: () => [...attachmentsKeys.all, 'delete'] as const,
};

/**
 * Query Options for fetching a grouped attachments.
 *
 * This function returns the configuration for querying group of attachments from target organization.
 *
 * @param param.orgIdOrSlug - Organization ID or slug.
 * @param param.attachmentId - attachmentId, to fetch all attachments of same group.
 * @returns  Query options.
 */
export const groupedAttachmentsQueryOptions = ({ orgIdOrSlug, attachmentId }: Pick<GetAttachmentsParams, 'attachmentId' | 'orgIdOrSlug'>) => {
  const queryKey = attachmentsKeys.list.base();

  return queryOptions({
    queryKey,
    queryFn: () => getAttachments({ attachmentId, orgIdOrSlug }),
    staleTime: 0,
    gcTime: 0,
  });
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
  limit = config.requestLimits.attachments,
}: Omit<GetAttachmentsParams, 'groupId'>) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  const queryKey = attachmentsKeys.list.table({ orgIdOrSlug, q, sort, order });

  return infiniteQueryOptions({
    queryKey,
    initialPageParam: { page: 0, offset: 0 },
    queryFn: async ({ pageParam: { page, offset }, signal }) => await getAttachments({ page, q, sort, order, limit, orgIdOrSlug, offset }, signal),
    getNextPageParam: (_lastPage, allPages) => {
      const page = allPages.length;
      const offset = allPages.reduce((acc, page) => acc + page.items.length, 0);
      return { page, offset };
    },
  });
};
