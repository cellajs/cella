import { infiniteQueryOptions } from '@tanstack/react-query';
import { type GetAttachmentsParams, getAttachments } from '~/api/attachments';
import { attachmentKeys } from '~/modules/common/query-client-provider/attachments';

// Build query to get attachments with infinite scroll
export const attachmentsQueryOptions = ({
  orgIdOrSlug,
  q,
  sort: initialSort,
  order: initialOrder,
  limit = 40,
  rowsLength = 0,
}: GetAttachmentsParams & {
  rowsLength?: number;
}) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: attachmentKeys.list({ orgIdOrSlug }),
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) =>
      getAttachments(
        {
          page,
          q,
          sort,
          order,
          // Fetch more items than the limit if some items were deleted
          limit: limit + Math.max(limit - rowsLength, 0),
          orgIdOrSlug,
          // If some items were added, offset should be undefined, otherwise it should be the length of the rows
          offset: rowsLength - limit > 0 ? undefined : rowsLength,
        },
        signal,
      ),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};
