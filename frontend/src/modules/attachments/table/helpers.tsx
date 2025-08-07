import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { type Collection, createCollection } from '@tanstack/react-db';
import { onlineManager } from '@tanstack/react-query';
import { appConfig } from 'config';
import { t } from 'i18next';
import { createAttachment } from '~/api.gen';
import { clientConfig } from '~/lib/api';
import { LocalFileStorage } from '~/modules/attachments/helpers/local-file-storage';
import { parseUploadedAttachments } from '~/modules/attachments/helpers/parse-uploaded';
import { attachmentsKeys } from '~/modules/attachments/query';
import type { AttachmentToInsert, LiveQueryAttachment } from '~/modules/attachments/types';
import { useTransaction } from '~/modules/attachments/use-transaction';
import { toaster } from '~/modules/common/toaster';
import type { CustomUppyFile, UploadedUppyFile } from '~/modules/common/uploader/types';
import { useUploader } from '~/modules/common/uploader/use-uploader';
import { queryClient } from '~/query/query-client';
import { baseBackoffOptions as backoffOptions } from '~/utils/electric-utils';
import { nanoid } from '~/utils/nanoid';

const maxNumberOfFiles = 20;
const maxTotalFileSize = maxNumberOfFiles * appConfig.uppy.defaultRestrictions.maxFileSize; // for maxNumberOfFiles files at 10MB max each

export const useAttachmentsUploadDialog = (
  attachmentCollection: Collection<LiveQueryAttachment>,
  localAttachmentCollection: Collection<LiveQueryAttachment>,
) => {
  const createAttachmens = useTransaction<LiveQueryAttachment>({
    mutationFn: async ({ transaction }) => {
      const { orgIdOrSlug, attachments } = transaction.metadata as { orgIdOrSlug: string; attachments: (AttachmentToInsert & { id: string })[] };
      try {
        await createAttachment({ body: attachments, path: { orgIdOrSlug } });
      } catch {
        toaster(t('error:create_resource', { resource: t('common:attachment') }), 'error');
      }
    },
  });

  const open = (organizationId: string) => {
    const onComplete = (result: UploadedUppyFile<'attachment'>) => {
      const attachments = parseUploadedAttachments(result, organizationId);
      const tableAttachmetns = attachments.map((a) => {
        const optimisticId = a.id || nanoid();
        const groupId = attachments.length > 1 ? nanoid() : null;

        return {
          id: optimisticId,
          filename: a.filename,
          name: a.filename.split('.').slice(0, -1).join('.'),
          content_type: a.contentType,
          size: a.size,
          original_key: a.originalKey,
          thumbnail_key: a.thumbnailKey ?? null,
          converted_key: a.convertedKey ?? null,
          converted_content_type: a.convertedContentType ?? null,
          entity_type: 'attachment' as const,
          created_at: new Date().toISOString(),
          created_by: null,
          modified_at: null,
          modified_by: null,
          group_id: groupId,
          organization_id: organizationId,
        };
      });

      if (onlineManager.isOnline()) {
        createAttachmens.metadata = { orgIdOrSlug: organizationId, attachments };
        createAttachmens.mutate(() => attachmentCollection.insert(tableAttachmetns));
      } else {
        localAttachmentCollection.insert(tableAttachmetns);
      }
      useUploader.getState().remove();
    };

    useUploader.getState().create({
      id: 'upload-attachment',
      isPublic: false,
      personalUpload: false,
      organizationId,
      templateId: 'attachment',
      restrictions: {
        maxNumberOfFiles,
        maxTotalFileSize,
        allowedFileTypes: ['*/*'],
      },
      plugins: ['webcam', 'image-editor', 'screen-capture', 'audio', 'url'],
      statusEventHandler: { onComplete },
      title: t('common:upload_item', {
        item: t('common:attachments').toLowerCase(),
      }),
      description: t('common:upload_multiple.text', {
        item: t('common:attachments').toLowerCase(),
        count: maxNumberOfFiles,
      }),
    });
  };

  return { open };
};

/**
 * Utility function to format bytes into human-readable format
 *
 * @param bytes The size in bytes
 * @returns Nicely formatted size
 */
export const formatBytes = (bytes: string): string => {
  const parsedBytes = Number(bytes);

  if (parsedBytes <= 0 || Number.isNaN(parsedBytes)) return '0 B';

  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.floor(Math.log(parsedBytes) / Math.log(1024));

  // Show 2 decimal places for MB or higher, else round to whole number
  const formattedSize = (parsedBytes / 1024 ** index).toFixed(index > 1 ? 2 : 0);

  return `${formattedSize} ${sizes[index]}`;
};

export const getAttachmentsCollection = (organizationId: string): Collection<LiveQueryAttachment> => {
  const params = {
    table: 'attachments',
    where: `organization_id = '${organizationId}'`,
  };

  return createCollection(
    electricCollectionOptions({
      id: `sync-attachments-${organizationId}`,
      shapeOptions: {
        url: new URL(`/${organizationId}/attachments/shape-proxy`, appConfig.backendUrl).href,
        params,
        backoffOptions,
        fetchClient: clientConfig.fetch,
        // onError: (error) => handleSyncError(error, storePrefix, params),
      },
      getKey: (item) => item.id,
    }),
  );
};

export const getLocalAttachmentsCollection = (organizationId: string): Collection<LiveQueryAttachment> => {
  return createCollection(
    queryCollectionOptions({
      id: `sync-local-attachments-${organizationId}`,
      getKey: (item) => item.id,
      queryKey: attachmentsKeys.local(),
      queryClient,
      queryFn: async () => {
        const storageData = await LocalFileStorage.getData(organizationId);
        if (!storageData) return [] as LiveQueryAttachment[];

        const files = Object.values(storageData.files ?? {});
        if (!files.length) return [] as LiveQueryAttachment[];

        const groupId = files.length > 1 ? nanoid() : null;

        return files.map(({ size, preview, id, type, data, meta }) => {
          return {
            id,
            filename: meta?.name || 'Unnamed file',
            name: meta.name,
            content_type: type,
            size: size ? String(size) : String(data.size),
            original_key: preview ?? '',
            thumbnail_key: null,
            converted_key: null,
            converted_content_type: null,
            entity_type: 'attachment' as const,
            created_at: new Date().toISOString(),
            created_by: null,
            modified_at: null,
            modified_by: null,
            group_id: groupId,
            organization_id: organizationId,
          };
        });
      },
      onInsert: async () => {
        try {
          console.info('Attachments were added locally');
          return { refetch: true };
        } catch {
          toaster(t('error:create_resource', { resource: t('common:attachment') }), 'error');
        }
      },

      onUpdate: async ({ transaction }) => {
        await Promise.all(
          transaction.mutations.map(async ({ changes, original }) => {
            try {
              const originalAttachment = original as LiveQueryAttachment;

              await LocalFileStorage.changeFile(originalAttachment.id, changes as Partial<CustomUppyFile>);
              return { refetch: true };
            } catch {
              toaster(t('error:update_resource', { resource: t('common:attachment') }), 'error');
            }
          }),
        );
      },

      onDelete: async ({ transaction }) => {
        const storedIds: string[] = [];
        for (const { changes } of transaction.mutations) {
          if (changes && 'id' in changes && typeof changes.id === 'string') storedIds.push(changes.id);
        }
        try {
          await LocalFileStorage.removeFiles(storedIds);
          console.info('Local attachments deleted');
          return { refetch: true };
        } catch (err) {
          toaster(t('error:delete_resource', { resource: t('common:attachment') }), 'error');
        }
      },
    }),
  );
};
