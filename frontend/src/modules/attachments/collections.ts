import { snakeCamelMapper } from '@electric-sql/client';
import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import { createCollection, localStorageCollectionOptions } from '@tanstack/react-db';
import { appConfig } from 'config';
import { t } from 'i18next';
import type { Attachment } from '~/api.gen';
import { createAttachment, deleteAttachments, updateAttachment } from '~/api.gen';
import { zAttachment } from '~/api.gen/zod.gen';
import { clientConfig } from '~/lib/api';
import { attachmentStorage } from '~/modules/attachments/dexie/storage-service';
import { toaster } from '~/modules/common/toaster/service';
import { offlineQueryConfig } from '~/query/provider';
import { baseBackoffOptions as backoffOptions, handleSyncError } from '~/utils/electric-utils';

const handleError = (action: 'create' | 'update' | 'delete' | 'deleteMany') => {
  if (action === 'deleteMany') toaster(t('error:delete_resources', { resources: t('common:attachments') }), 'error');
  else toaster(t(`error:${action}_resource`, { resource: t('common:attachment') }), 'error');
};

/**
 * Show success toast for attachment operations
 */
const showSuccessToast = (count: number, action: 'create' | 'delete') => {
  const resourceKey = count === 1 ? 'common:attachment' : 'common:attachments';
  const messageKey = count === 1 ? `common:success.${action}_resource` : `common:success.${action}_counted_resources`;

  const message =
    count === 1
      ? t(messageKey, { resource: t(resourceKey) })
      : t(messageKey, { count, resources: t(resourceKey).toLowerCase() });

  toaster(message, 'success');
};

/**
 * Creates an attachment via API with error handling
 * Exported for use by offline executor
 */
export const syncCreateAttachments = async (attachments: Attachment[], orgIdOrSlug: string): Promise<void> => {
  await createAttachment({ body: attachments, path: { orgIdOrSlug } });
  attachmentStorage.addCachedImage(attachments);
  showSuccessToast(attachments.length, 'create');
};

/**
 * Updates an attachment via API with error handling
 * Exported for use by offline executor
 */
export const syncUpdateAttachment = async (
  id: string,
  changes: Partial<Attachment>,
  orgIdOrSlug: string,
): Promise<void> => {
  await updateAttachment({ body: changes, path: { id, orgIdOrSlug } });
};

/**
 * Deletes attachments via API with error handling
 * Exported for use by offline executor
 */
export const syncDeleteAttachments = async (ids: string[], orgIdOrSlug: string): Promise<void> => {
  await Promise.all([
    deleteAttachments({ body: { ids }, path: { orgIdOrSlug } }),
    attachmentStorage.deleteCachedImages(ids),
  ]);
  showSuccessToast(ids.length, 'delete');
};

// Internal implementation for creating attachments collection
const createAttachmentsCollectionImpl = (orgIdOrSlug: string, forOfflinePrefetch = false) =>
  createCollection(
    electricCollectionOptions({
      id: `${orgIdOrSlug}-attachments`,
      schema: zAttachment,
      getKey: (item) => item.id,
      shapeOptions: {
        url: new URL(`/${orgIdOrSlug}/attachments/sync-attachments`, appConfig.backendUrl).href,
        params: { table: 'attachments' },
        backoffOptions,
        fetchClient: clientConfig.fetch,
        columnMapper: snakeCamelMapper(),
        onError: (error) => handleSyncError(error),
      },
      ...(forOfflinePrefetch ? offlineQueryConfig : {}),
      // Note: Electric collections use on-demand syncMode by default.
      // Data is loaded via live queries, not preload(). See:
      // https://tanstack.com/blog/tanstack-db-0.5-query-driven-sync
      //
      // Note: onInsert, onUpdate, onDelete callbacks are intentionally omitted.
      // All CRUD operations go through the offline executor (useOfflineAttachments hook)
      // which handles sync via its mutationFns. Having both would cause duplicate API calls.
      // For direct collection operations that don't need server sync (e.g., adding data
      // received from Electric sync), the callbacks should NOT fire anyway.
    }),
  );

// Internal implementation for creating local attachments collection
const createLocalAttachmentsCollectionImpl = (orgIdOrSlug: string) =>
  createCollection(
    localStorageCollectionOptions({
      id: `${orgIdOrSlug}-local-attachments`,
      schema: zAttachment,
      getKey: (item) => item.id,
      storageKey: `${appConfig.name}-local-attachments`,
      onInsert: async ({ transaction }) => {
        const newAttachments = transaction.mutations.map(({ modified }) => modified);

        const message =
          newAttachments.length === 1
            ? t('common:success.create_resource', { resource: t('common:attachment') })
            : t('common:success.create_counted_resources', {
              count: newAttachments.length,
              resources: t('common:attachments').toLowerCase(),
            });

        toaster(message, 'success');
      },
      onUpdate: async ({ transaction }) => {
        try {
          for (const { changes: body, original } of transaction.mutations) {
            if (!body.name) continue;
            return { ...original, name: body.name };
          }
        } catch (err) {
          handleError('update');
        }
      },
      onDelete: async ({ transaction }) => {
        const ids = transaction.mutations.map(({ modified }) => modified.id);
        try {
          attachmentStorage.deleteCachedImages(ids);
        } catch (err) {
          handleError(ids.length > 1 ? 'deleteMany' : 'delete');
        }
      },
    }),
  );

// Cache collections to avoid recreating them on every call
// This prevents breaking the sync connection when routes re-render
type AttachmentsCollection = ReturnType<typeof createAttachmentsCollectionImpl>;
type LocalAttachmentsCollection = ReturnType<typeof createLocalAttachmentsCollectionImpl>;

const attachmentsCollectionCache = new Map<string, AttachmentsCollection>();
const localAttachmentsCollectionCache = new Map<string, LocalAttachmentsCollection>();

/**
 * Get or create an attachments collection for an organization.
 * Collections are cached to maintain sync connections across route changes.
 */
export const initAttachmentsCollection = (orgIdOrSlug: string, forOfflinePrefetch = false): AttachmentsCollection => {
  const cacheKey = `${orgIdOrSlug}-${forOfflinePrefetch}`;
  const cached = attachmentsCollectionCache.get(cacheKey);
  if (cached) return cached;

  const collection = createAttachmentsCollectionImpl(orgIdOrSlug, forOfflinePrefetch);
  attachmentsCollectionCache.set(cacheKey, collection);
  return collection;
};

/**
 * Get or create a local attachments collection for an organization.
 * Collections are cached to maintain state across route changes.
 */
export const initLocalAttachmentsCollection = (orgIdOrSlug: string): LocalAttachmentsCollection => {
  const cached = localAttachmentsCollectionCache.get(orgIdOrSlug);
  if (cached) return cached;

  const collection = createLocalAttachmentsCollectionImpl(orgIdOrSlug);
  localAttachmentsCollectionCache.set(orgIdOrSlug, collection);
  return collection;
};
