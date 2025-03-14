import { t } from 'i18next';
import { Suspense } from 'react';
import type { UploadedUppyFile } from '~/lib/imado/types';
import { useAttachmentCreateMutation, useAttachmentDeleteMutation } from '~/modules/attachments/query/mutations';
import UploadUppy from '~/modules/attachments/upload/upload-uppy';
import { dialog } from '~/modules/common/dialoger/state';
import Spinner from '~/modules/common/spinner';
import { nanoid } from '~/utils/nanoid';

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

const maxNumberOfFiles = 20;
const maxTotalFileSize = 10 * 1024 * 1024 * maxNumberOfFiles; // for maxNumberOfFiles files at 10MB max each

/**
 * Open the upload dialog
 */
export const openAttachmentsUploadDialog = (organizationId: string) => {
  const UploadDialog = ({ organizationId }: { organizationId: string }) => {
    const { mutate: createAttachments } = useAttachmentCreateMutation();
    const { mutate: deleteAttachments } = useAttachmentDeleteMutation();

    const handleCallback = (result: UploadedUppyFile[]) => {
      const attachments = result.map(({ file, url }) => ({
        id: file.id || nanoid(),
        url,
        size: String(file.size || 0),
        contentType: file.type,
        filename: file.name || 'unknown',
        organizationId,
      }));

      createAttachments({ attachments, orgIdOrSlug: organizationId });
      dialog.remove(true, 'upload-attachment');
    };

    const handleSuccessesRetryCallback = async (result: UploadedUppyFile[], ids: string[]) => {
      handleCallback(result);

      deleteAttachments({ orgIdOrSlug: organizationId, ids });
    };

    return (
      <UploadUppy
        isPublic
        uploadType="personal"
        restrictions={{ maxNumberOfFiles, allowedFileTypes: ['*/*'], maxTotalFileSize }}
        plugins={['webcam', 'image-editor', 'screen-capture', 'audio']}
        imageMode="attachment"
        callback={handleCallback}
        onRetrySuccessCallback={handleSuccessesRetryCallback}
      />
    );
  };

  dialog(
    <Suspense fallback={<Spinner className="my-44 h-12 w-12" />}>
      <UploadDialog organizationId={organizationId} />
    </Suspense>,
    {
      id: 'upload-attachment',
      drawerOnMobile: false,
      title: t('common:upload_item', { item: t('common:attachments').toLowerCase() }),
      description: t('common:upload_multiple.text', { item: t('common:attachments').toLowerCase(), count: maxNumberOfFiles }),
      className: 'md:max-w-xl',
    },
  );
};
