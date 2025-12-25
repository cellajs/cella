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
  const messageKey =
    count === 1 ? `common:success.${action}_resource` : `common:success.${action}_counted_resources`;

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

export const initAttachmentsCollection = (orgIdOrSlug: string, forOfflinePrefetch = false) =>
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
      syncMode: 'progressive',
      onInsert: async ({ transaction }) => {
        const newAttachments = transaction.mutations.map(({ modified }) => modified);
        try {
          await syncCreateAttachments(newAttachments, orgIdOrSlug);
        } catch (err) {
          handleError('create');
        }
      },
      onUpdate: async ({ transaction }) => {
        try {
          for (const { changes: body, original } of transaction.mutations) {
            await syncUpdateAttachment(original.id, body, orgIdOrSlug);
          }
        } catch (err) {
          handleError('update');
        }
      },
      onDelete: async ({ transaction }) => {
        const ids = transaction.mutations.map(({ modified }) => modified.id);

        try {
          await syncDeleteAttachments(ids, orgIdOrSlug);
        } catch (err) {
          handleError(ids.length > 1 ? 'deleteMany' : 'delete');
        }
      },
    }),
  );

// TODO(DAVID) create custom events for local store ?
export const initLocalAttachmentsCollection = (orgIdOrSlug: string) =>
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
            // const file = await attachmentStorage.updateFileName(original.id, body.name);

            // if (!file) throw new Error(`Failed to update file name (${original.id}):`);

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
