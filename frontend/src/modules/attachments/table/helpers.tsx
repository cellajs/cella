import { appConfig } from 'config';
import { t } from 'i18next';
import { createAttachment } from '~/api.gen';
import { parseUploadedAttachments } from '~/modules/attachments/helpers';
import { attachmentQueryKeys } from '~/modules/attachments/query';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';
import { useUploader } from '~/modules/common/uploader/use-uploader';
import { createTxForCreate } from '~/query/offline';
import { queryClient } from '~/query/query-client';

const maxNumberOfFiles = 20;
const maxTotalFileSize = maxNumberOfFiles * appConfig.uppy.defaultRestrictions.maxFileSize; // for maxNumberOfFiles files at 10MB max each

export const useAttachmentsUploadDialog = (organizationSlug: string) => {
  const open = () => {
    const onComplete = async (result: UploadedUppyFile<'attachment'>) => {
      const attachments = parseUploadedAttachments(result, organizationSlug);

      // Create attachments via API with transaction metadata
      const tx = createTxForCreate();
      await createAttachment({ path: { orgIdOrSlug: organizationSlug }, body: { data: attachments, tx } });

      // Invalidate the cache to refresh the table
      queryClient.invalidateQueries({ queryKey: attachmentQueryKeys.list.base });

      useUploader.getState().remove();
    };

    useUploader.getState().create({
      id: 'upload-attachment',
      isPublic: false,
      personalUpload: false,
      organizationId: organizationSlug,
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
