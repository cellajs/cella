import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { appConfig } from 'config';
import type { Attachment } from '~/api.gen';
import { type GetAttachmentsData, getAttachments } from '~/api.gen';
import { baseInfiniteQueryOptions, infiniteQueryUseCachedIfCompleteOptions } from '~/query/utils/infinite-query-options';
import { createEntityKeys } from '../entities/create-query-keys';

type AttachmentFilters = GetAttachmentsData['path'] & Omit<NonNullable<GetAttachmentsData['query']>, 'limit' | 'offset'>;

const baseKeys = createEntityKeys<AttachmentFilters>('attachment');

const keys = {
  ...baseKeys,
  list: {
    ...baseKeys.list,
    similar: (filters: Pick<AttachmentFilters, 'orgIdOrSlug'>) => ['attachment', 'list', { ...filters, mode: 'similar' }] as const,
  },
};

export const attachmentQueryKeys = keys;

/**
 * Query Options for fetching grouped attachments.
 *
 * This function returns the configuration for querying group of attachments from target organization.
 *
 * @param param.orgIdOrSlug - Organization ID or slug.
 * @param param.attachmentId - attachmentId, to fetch all attachments of same group.
 * @returns  Query options.
 */
export const groupedAttachmentsQueryOptions = ({ orgIdOrSlug, attachmentId }: Pick<AttachmentFilters, 'attachmentId' | 'orgIdOrSlug'>) => {
  const queryKey = keys.list.base;

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
}: Omit<AttachmentFilters, 'groupId'> & { limit?: number }) => {
  const limit = String(baseLimit);

  const baseQueryKey = keys.list.filtered({ orgIdOrSlug, q: '', sort: 'createdAt', order: 'desc' });
  const queryKey = keys.list.filtered({ orgIdOrSlug, q, sort, order });

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
