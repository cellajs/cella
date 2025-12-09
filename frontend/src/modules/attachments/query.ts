import { snakeCamelMapper } from '@electric-sql/client';
import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import { createCollection } from '@tanstack/react-db';
import { queryOptions } from '@tanstack/react-query';
import { appConfig } from 'config';
import { t } from 'i18next';
import { createAttachment, deleteAttachments, type GetAttachmentsData, getAttachments, updateAttachment } from '~/api.gen';
import { zAttachment } from '~/api.gen/zod.gen';
import { clientConfig } from '~/lib/api';
import { toaster } from '~/modules/common/toaster/service';
import { baseBackoffOptions as backoffOptions, handleSyncError } from '~/utils/electric-utils';

type GetAttachmentsParams = GetAttachmentsData['path'] & Omit<NonNullable<GetAttachmentsData['query']>, 'limit' | 'offset'>;

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
  const queryKey = ['attachments', 'preview'];

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

const handleError = (action: 'create' | 'update' | 'delete' | 'deleteMany') => {
  if (action === 'deleteMany') toaster(t('error:delete_resources', { resources: t('common:attachments') }), 'error');
  else toaster(t(`error:${action}_resource`, { resource: t('common:attachment') }), 'error');
};

// TODO(tanstackDB) add abort
export const initAttachmentsCollection = (orgIdOrSlug: string) =>
  createCollection(
    electricCollectionOptions({
      id: `${orgIdOrSlug}-attachments`,
      schema: zAttachment,
      getKey: (item) => item.id,
      shapeOptions: {
        url: new URL(`/${orgIdOrSlug}/attachments/shape-proxy`, appConfig.backendUrl).href,
        params: { table: 'attachments' },
        backoffOptions,
        fetchClient: clientConfig.fetch,
        columnMapper: snakeCamelMapper(),
        onError: (error) => handleSyncError(error),
      },
      syncMode: 'progressive',
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
        try {
          for (const { changes: body, original } of transaction.mutations) {
            await updateAttachment({ body, path: { id: original.id, orgIdOrSlug } });
          }
        } catch (err) {
          handleError('update');
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

// TODO(DAVID) create custom events for local store ?
// export const initLocalAttachmentsCollection = (orgIdOrSlug: string) =>
//   createCollection(
//     localStorageCollectionOptions({
//       id: `${orgIdOrSlug}-local-attachments`,
//       schema: zAttachment,
//       getKey: (item) => item.id,
//       storageKey: `${appConfig.name}-local-attachments`,
//       onInsert: async ({ transaction }) => {
//         const newAttachments = transaction.mutations.map(({ modified }) => modified);

//         const message =
//           newAttachments.length === 1
//             ? t('common:success.create_resource', { resource: t('common:attachment') })
//             : t('common:success.create_counted_resources', { count: newAttachments.length, resources: t('common:attachments').toLowerCase() });

//         toaster(message, 'success');
//       },
//       onUpdate: async ({ transaction }) => {
//         try {
//           for (const { changes: body, original } of transaction.mutations) {
//             if (!body.name) continue;
//             const file = await LocalFileStorage.updateFileName(original.id, body.name);

//             if (!file) throw new Error(`Failed to update file name (${original.id}):`);

//             return { ...original, name: body.name };
//           }
//         } catch (err) {
//           handleError('update');
//         }
//       },
//       onDelete: async ({ transaction }) => {
//         const ids = transaction.mutations.map(({ modified }) => modified.id);
//         try {
//           await LocalFileStorage.removeFiles(ids);
//         } catch (err) {
//           handleError(ids.length > 1 ? 'deleteMany' : 'delete');
//         }
//       },
//     }),
//   );
