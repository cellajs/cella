import { infiniteQueryOptions } from '@tanstack/react-query';
import { config } from 'config';
import { type GetAttachmentsParams, getAttachments } from '~/api/attachments';
import { attachmentKeys } from '~/modules/common/query-client-provider/keys';

const LIMIT = config.requestLimits.attachments;

// Build query to get attachments with infinite scroll
export const attachmentsQueryOptions = ({ orgIdOrSlug, q = '', sort: initialSort, order: initialOrder, limit = LIMIT }: GetAttachmentsParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: attachmentKeys.list({ orgIdOrSlug, q, sort, order }),
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) => await getAttachments({ page, q, sort, order, limit, orgIdOrSlug }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
