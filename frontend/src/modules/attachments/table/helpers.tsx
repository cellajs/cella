import { onlineManager } from '@tanstack/react-query';
import { appConfig } from 'config';
import { t } from 'i18next';
import { parseUploadedAttachments } from '~/modules/attachments/helpers/parse-uploaded';
import { getAttachmentsCollection, getLocalAttachmentsCollection } from '~/modules/attachments/query';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';
import { useUploader } from '~/modules/common/uploader/use-uploader';
import { nanoid } from '~/utils/nanoid';

const maxNumberOfFiles = 20;
const maxTotalFileSize = maxNumberOfFiles * appConfig.uppy.defaultRestrictions.maxFileSize; // for maxNumberOfFiles files at 10MB max each

export const useAttachmentsUploadDialog = () => {
  const open = (organizationId: string) => {
    const attachmentCollection = getAttachmentsCollection(organizationId);
    const localAttachmentCollection = getLocalAttachmentsCollection(organizationId);

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

      if (onlineManager.isOnline()) attachmentCollection.insert(tableAttachmetns, { metadata: { attachments } });
      else localAttachmentCollection.insert(tableAttachmetns);

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
