import { useLoaderData } from '@tanstack/react-router';
import { appConfig } from 'config';
import { t } from 'i18next';
import { Attachment } from '~/api.gen';
import { parseUploadedAttachments } from '~/modules/attachments/helpers/parse-uploaded';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';
import { useUploader } from '~/modules/common/uploader/use-uploader';
import { OrganizationAttachmentsRoute } from '~/routes/organization-routes';

const maxNumberOfFiles = 20;
const maxTotalFileSize = maxNumberOfFiles * appConfig.uppy.defaultRestrictions.maxFileSize; // for maxNumberOfFiles files at 10MB max each

export const useAttachmentsUploadDialog = () => {
  const { attachmentsCollection } = useLoaderData({ from: OrganizationAttachmentsRoute.id });

  const open = (organizationId: string) => {
    const onComplete = (result: UploadedUppyFile<'attachment'>) => {
      const attachments = parseUploadedAttachments(result, organizationId);

      //  TODO(tanstackDB) add offline handle
      //       const collection = appConfig.has.uploadEnabled && onlineManager.isOnline() ? attachmentsCollection : localAttachmentsCollection;
      const collection = attachmentsCollection;

      // TODO(tanstackDB) fix types (mb wait till v1)
      collection.insert(attachments as unknown as Attachment[]);
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
