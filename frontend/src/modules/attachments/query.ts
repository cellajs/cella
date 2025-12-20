import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { appConfig } from 'config';
import { type GetAttachmentsData, getAttachments } from '~/api.gen';
import { baseInfiniteQueryOptions } from '~/query/utils/infinite-query-options';
import { createEntityKeys } from '../entities/create-query-keys';

type AttachmentFilters = GetAttachmentsData['path'] &
  Omit<NonNullable<GetAttachmentsData['query']>, 'limit' | 'offset'>;

const baseKeys = createEntityKeys<AttachmentFilters>('attachment');

const keys = {
  ...baseKeys,
  list: {
    ...baseKeys.list,
    similar: (filters: Pick<AttachmentFilters, 'orgIdOrSlug'>) =>
      ['attachment', 'list', { ...filters, mode: 'similar' }] as const,
  },
};

/**
 * Attachment query keys.
 */
export const attachmentQueryKeys = keys;

/**
 * Query options for fetching grouped attachments.
 */
export const groupedAttachmentsQueryOptions = ({
  orgIdOrSlug,
  attachmentId,
}: Pick<AttachmentFilters, 'attachmentId' | 'orgIdOrSlug'>) => {
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
 */
export const attachmentsQueryOptions = ({
  orgIdOrSlug,
  q = '',
  sort = 'createdAt',
  order = 'desc',
  limit: baseLimit = appConfig.requestLimits.attachments,
}: Omit<AttachmentFilters, 'groupId'> & { limit?: number }) => {
  const limit = String(baseLimit);

  const queryKey = keys.list.filtered({ orgIdOrSlug, q, sort, order });

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset || (page || 0) * Number(limit));
      return await getAttachments({ query: { q, sort, order, limit, offset }, path: { orgIdOrSlug }, signal });
    },
    ...baseInfiniteQueryOptions,
  });
};
