import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import { createCollection } from '@tanstack/react-db';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { appConfig } from 'config';
import { t } from 'i18next';
import type { Attachment } from '~/api.gen';
import { createAttachment, deleteAttachments, type GetAttachmentsData, getAttachments, updateAttachment } from '~/api.gen';
import { zAttachment } from '~/api.gen/zod.gen';
import { clientConfig } from '~/lib/api';
import { baseInfiniteQueryOptions, infiniteQueryUseCachedIfCompleteOptions } from '~/query/utils/infinite-query-options';
import { baseBackoffOptions as backoffOptions, handleSyncError } from '~/utils/electric-utils';
import { toaster } from '../common/toaster/service';

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

const handleError = (action: 'create' | 'update' | 'delete' | 'deleteMany') => {
  if (action === 'deleteMany') toaster(t('error:delete_resources', { resources: t('common:attachments') }), 'error');
  else toaster(t(`error:${action}_resource`, { resource: t('common:attachment') }), 'error');
};
// TODO(DAVID) add abort
export const attachmentsCollection = (orgIdOrSlug: string) =>
  createCollection(
    electricCollectionOptions({
      // schema: zAttachment,

      getKey: (item) => item.id,
      shapeOptions: {
        url: new URL(`/${orgIdOrSlug}/attachments/shape-proxy`, appConfig.backendUrl).href,
        params: { table: 'attachments' },
        backoffOptions,
        fetchClient: clientConfig.fetch,
        onError: (error) => handleSyncError(error),
      },
      onInsert: async ({ transaction }) => {
        const newAttachments = transaction.mutations.map(({ modified }) => modified);

        try {
          await createAttachment({ body: newAttachments, path: { orgIdOrSlug } });
          const message =
            newAttachments.length === 1
              ? t('common:success.create_resource', { resource: t('common:attachment') })
              : t('common:success.create_counted_resources', { count: newAttachments.length, resources: t('common:attachments').toLowerCase() });

          toaster(message, 'success');
        } catch (err) {
          handleError('create');
        }
      },
      onUpdate: async ({ transaction }) => {
        for (const { changes: body, original } of transaction.mutations) {
          // if (localUpdate && name) {
          //   const file = await LocalFileStorage.updateFileName(id, name);

          //   if (!file) throw new Error(`Failed to update file name (${id}):`);

          //   // TODO(IMPROVE)offline update responce(add createdAt/By, groupId into the file?)
          //   const localAttachment: Attachment = {
          //     id: file.id,
          //     size: String(file.data?.size ?? 0),
          //     url: file.preview || '',
          //     thumbnailUrl: null,
          //     convertedUrl: null,
          //     contentType: file.type,
          //     convertedContentType: null,
          //     name: file.name || file.meta.name,
          //     public: file.meta.public ?? false,
          //     bucketName: file.meta.bucketName,
          //     entityType: 'attachment',
          //     createdAt: new Date().toISOString(),
          //     createdBy: null,
          //     modifiedAt: new Date().toISOString(),
          //     modifiedBy: null,
          //     groupId: '',
          //     filename: file.meta.name || 'Unnamed file',
          //     organizationId,
          //   };
          //   return localAttachment;
          // }
          try {
            await updateAttachment({ body, path: { id: original.id, orgIdOrSlug } });
          } catch (err) {
            handleError('update');
          }
        }
      },
      onDelete: async ({ transaction }) => {
        const ids = transaction.mutations.map(({ modified }) => modified.id);
        try {
          await deleteAttachments({ body: { ids }, path: { orgIdOrSlug } });
        } catch (err) {
          handleError(ids.length > 1 ? 'deleteMany' : 'delete');
        }
      },
    }),
  );
