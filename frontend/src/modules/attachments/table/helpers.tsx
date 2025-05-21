import { t } from 'i18next';
import { parseUploadedAttachments } from '~/modules/attachments/helpers';
import { useAttachmentCreateMutation } from '~/modules/attachments/query/mutations';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';
import { useUploader } from '~/modules/common/uploader/use-uploader';

const maxNumberOfFiles = 20;
const maxTotalFileSize = 10 * 1024 * 1024 * maxNumberOfFiles; // for maxNumberOfFiles files at 10MB max each

export const useAttachmentsUploadDialog = () => {
  const { mutate: createAttachments } = useAttachmentCreateMutation();

  const open = (organizationId: string) => {
    const onComplete = (result: UploadedUppyFile<'attachment'>) => {
      const attachments = parseUploadedAttachments(result, organizationId);
      createAttachments({ attachments, orgIdOrSlug: organizationId });
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
        allowedFileTypes: ['*/*'],
        maxTotalFileSize,
      },
      plugins: ['webcam', 'image-editor', 'screen-capture', 'audio'],
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
