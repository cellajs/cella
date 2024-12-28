import { infiniteQueryOptions } from '@tanstack/react-query';
import { config } from 'config';
import { type GetAttachmentsParams, getAttachments } from '~/api/attachments';
import { attachmentsKeys } from '~/query/query-key-factories';

const LIMIT = config.requestLimits.attachments;

// Build query to get attachments with infinite scroll
export const attachmentsQueryOptions = ({ orgIdOrSlug, q = '', sort: initialSort, order: initialOrder, limit = LIMIT }: GetAttachmentsParams) => {
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
