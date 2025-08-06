import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import { type Collection, createCollection } from '@tanstack/react-db';
import { onlineManager } from '@tanstack/react-query';
import { appConfig } from 'config';
import { t } from 'i18next';
import z from 'zod';
import { clientConfig } from '~/lib/api';
import { parseUploadedAttachments } from '~/modules/attachments/helpers/parse-uploaded';
import { useAttachmentCreateMutation } from '~/modules/attachments/query-mutations';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';
import { useUploader } from '~/modules/common/uploader/use-uploader';
import { baseBackoffOptions as backoffOptions, type CamelToSnakeObject } from '~/utils/electric-utils';
import type { Attachment } from '../types';

const maxNumberOfFiles = 20;
const maxTotalFileSize = maxNumberOfFiles * appConfig.uppy.defaultRestrictions.maxFileSize; // for maxNumberOfFiles files at 10MB max each

export const useAttachmentsUploadDialog = () => {
  const { mutate: createAttachments } = useAttachmentCreateMutation();

  const open = (organizationId: string) => {
    const onComplete = (result: UploadedUppyFile<'attachment'>) => {
      const attachments = parseUploadedAttachments(result, organizationId);
      createAttachments({ localCreation: !onlineManager.isOnline(), attachments, orgIdOrSlug: organizationId });
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

export const getAttachmentsCollection = (organizationId: string): Collection<CamelToSnakeObject<Attachment>> => {
  const params = {
    table: 'attachments',
    where: `organization_id = '${organizationId}'`,
  };

  return createCollection(
    electricCollectionOptions({
      id: 'sync-attachments',
      shapeOptions: {
        url: new URL(`/${organizationId}/attachments/shape-proxy`, appConfig.backendUrl).href,
        params,
        backoffOptions,
        fetchClient: clientConfig.fetch,
        // onError: (error) => handleSyncError(error, storePrefix, params),
      },
      schema: z.object({
        id: z.string(),
        created_at: z.string(),
        name: z.string(),
        entity_type: z.enum(['attachment']),
        group_id: z.union([z.string(), z.null()]),
        filename: z.string(),
        content_type: z.string(),
        converted_content_type: z.union([z.string(), z.null()]),
        size: z.string(),
        created_by: z.union([z.string(), z.null()]),
        modified_at: z.union([z.string(), z.null()]),
        modified_by: z.union([z.string(), z.null()]),
        organization_id: z.string(),
        original_key: z.string(),
        thumbnail_key: z.union([z.string(), z.null()]),
        converted_key: z.union([z.string(), z.null()]),
      }),

      getKey: (item) => item.id,
    }),
  );
};
