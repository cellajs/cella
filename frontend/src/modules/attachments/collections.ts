import { snakeCamelMapper } from '@electric-sql/client';
import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import { createCollection, localStorageCollectionOptions } from '@tanstack/react-db';
import { appConfig } from 'config';
import { t } from 'i18next';
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

export const initAttachmentsCollection = (orgIdOrSlug: string, forOfflinePrefetch = false) =>
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
      ...(forOfflinePrefetch ? offlineQueryConfig : {}),
      syncMode: 'progressive',
      onInsert: async ({ transaction }) => {
        const newAttachments = transaction.mutations.map(({ modified }) => modified);
        try {
          await createAttachment({ body: newAttachments, path: { orgIdOrSlug } });

          // Preload new image attachments in parallel
          attachmentStorage.addCachedImage(newAttachments);

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
          // 1. Delete attachments on the server (remote API)
          // 2. Delete cached attachment files in IndexedDB(Dexie) (local storage)
          await Promise.all([deleteAttachments({ body: { ids }, path: { orgIdOrSlug } }), attachmentStorage.deleteCachedImages(ids)]);
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
            : t('common:success.create_counted_resources', { count: newAttachments.length, resources: t('common:attachments').toLowerCase() });

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
          // await attachmentStorage.removeFiles(ids);
        } catch (err) {
          handleError(ids.length > 1 ? 'deleteMany' : 'delete');
        }
      },
    }),
  );
