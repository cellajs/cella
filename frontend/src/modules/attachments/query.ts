import { queryOptions } from '@tanstack/react-query';
import { type GetAttachmentsGroupData, getAttachmentsGroup } from '~/api.gen';

/**
 * Keys for attachments related queries. These keys help to uniquely identify different query.
 * For managing query caching and invalidation.
 */
export const attachmentsKeys = {
  all: ['attachments'] as const,
  local: () => [...attachmentsKeys.all, 'local'] as const,
  list: () => [...attachmentsKeys.all, 'list'] as const,
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
export const groupedAttachmentsQueryOptions = ({
  orgIdOrSlug,
  mainAttachmentId,
}: GetAttachmentsGroupData['path'] & GetAttachmentsGroupData['query']) =>
  queryOptions({
    queryKey: attachmentsKeys.list(),
    queryFn: () => getAttachmentsGroup({ query: { mainAttachmentId }, path: { orgIdOrSlug } }),
    staleTime: 0,
    gcTime: 0,
  });
