import { queryOptions } from '@tanstack/react-query';
import { type GetAttachmentsData, type GetAttachmentsGroupData, getAttachmentsGroup } from '~/api.gen';

type GetAttachmentsParams = GetAttachmentsData['path'] & Omit<NonNullable<GetAttachmentsData['query']>, 'limit' | 'offset'>;
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
export const groupedAttachmentsQueryOptions = ({
  orgIdOrSlug,
  mainAttachmentId,
}: GetAttachmentsGroupData['path'] & GetAttachmentsGroupData['query']) =>
  queryOptions({
    queryKey: attachmentsKeys.list.base(),
    queryFn: () => getAttachmentsGroup({ query: { mainAttachmentId }, path: { orgIdOrSlug } }),
    staleTime: 0,
    gcTime: 0,
  });
