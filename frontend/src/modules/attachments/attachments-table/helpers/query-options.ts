import { infiniteQueryOptions } from '@tanstack/react-query';
import { config } from 'config';
import { type GetAttachmentsParams, getAttachments } from '~/api/attachments';
import { attachmentKeys } from '~/modules/common/query-client-provider/keys';
import { getPaginatedOffset } from '~/utils/mutate-query';

const LIMIT = config.requestLimits.attachments;

// Build query to get attachments with infinite scroll
export const attachmentsQueryOptions = ({ orgIdOrSlug, q = '', sort: initialSort, order: initialOrder, limit = LIMIT }: GetAttachmentsParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  const queryKey = attachmentKeys.list({ orgIdOrSlug, q, sort, order });
  const offset = getPaginatedOffset(queryKey);

  return infiniteQueryOptions({
    queryKey: attachmentKeys.list({ orgIdOrSlug, q, sort, order }),
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) => await getAttachments({ page, q, sort, order, limit, orgIdOrSlug, offset }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
