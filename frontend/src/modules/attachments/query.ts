import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { appConfig } from 'config';
import type { Attachment } from '~/api.gen';
import { type GetAttachmentsData, getAttachments } from '~/api.gen';
import { baseInfiniteQueryOptions, infiniteQueryUseCachedIfCompleteOptions } from '~/query/utils/infinite-query-options';

type GetAttachmentsParams = GetAttachmentsData['path'] & Omit<NonNullable<GetAttachmentsData['query']>, 'limit' | 'offset'>;
/**
 * Keys for attachments related queries. These keys help to uniquely identify different query.
 * For managing query caching and invalidation.
 */
const keys = {
  all: ['attachments'],
  list: {
    base: ['attachments', 'list'],
    table: (filters: GetAttachmentsParams) => [...keys.list.base, 'table', filters],
    similarTable: (filters: Pick<GetAttachmentsParams, 'orgIdOrSlug'>) => [...keys.list.base, 'table', filters],
  },
  create: ['attachments', 'create'],
  update: ['attachments', 'update'],
  delete: ['attachments', 'delete'],
};

export const attachmentsKeys = keys;

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
  const queryKey = attachmentsKeys.list.base;

  return queryOptions({
    queryKey,
    queryFn: () =>
      getAttachments({
        query: { attachmentId, offset: String(0), limit: String(appConfig.requestLimits.attachments) },
        path: { orgIdOrSlug },
      }),
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
 * @param param.limit - Number of items per page (default: `appConfig.requestLimits.attachments`).
 * @returns Infinite query options.
 */
export const attachmentsQueryOptions = ({
  orgIdOrSlug,
  q = '',
  sort = 'createdAt',
  order = 'desc',
  limit: baseLimit = appConfig.requestLimits.attachments,
}: Omit<GetAttachmentsParams, 'groupId' | 'limit'> & { limit?: number }) => {
  const limit = String(baseLimit);

  const baseQueryKey = attachmentsKeys.list.table({ orgIdOrSlug, q: '', sort: 'createdAt', order: 'desc' });
  const queryKey = attachmentsKeys.list.table({ orgIdOrSlug, q, sort, order });

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || (page || 0) * Number(limit));
      return await getAttachments({ query: { q, sort, order, limit, offset }, path: { orgIdOrSlug }, signal });
    },
    ...baseInfiniteQueryOptions,
    ...infiniteQueryUseCachedIfCompleteOptions<Attachment>(baseQueryKey, {
      q,
      sort,
      order,
      searchIn: ['name', 'filename'],
      limit: baseLimit,
    }),
  });
};
