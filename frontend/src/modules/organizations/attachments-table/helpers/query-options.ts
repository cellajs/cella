import { infiniteQueryOptions } from '@tanstack/react-query';
import { config } from 'config';
import { type GetAttachmentsParams, getAttachments } from '~/api/attachments';
import { attachmentKeys } from '~/modules/common/query-client-provider/attachments';

const LIMIT = config.requestLimits.attachments;

// Build query to get attachments with infinite scroll
export const attachmentsQueryOptions = ({
  orgIdOrSlug,
  q = '',
  sort: initialSort,
  order: initialOrder,
  limit = LIMIT,
  rowsLength = 0,
}: GetAttachmentsParams & {
  rowsLength?: number;
}) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';
  const offset = rowsLength;

  return infiniteQueryOptions({
    queryKey: attachmentKeys.list({ orgIdOrSlug, q, sort, order }),
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) => getAttachments({ page, q, sort, order, limit, orgIdOrSlug, offset }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
