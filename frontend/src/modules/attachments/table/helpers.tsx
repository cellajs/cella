import { t } from 'i18next';
import { type RefObject, Suspense } from 'react';
import type { UploadedUppyFile } from '~/lib/imado/types';
import { parseUploadedAttachments } from '~/modules/attachments/helpers';
import { useAttachmentCreateMutation, useAttachmentDeleteMutation } from '~/modules/attachments/query/mutations';
import UploadUppy from '~/modules/attachments/upload/upload-uppy';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import Spinner from '~/modules/common/spinner';

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
 * Open the upload dialog for attachments
 *
 * Attachments are private and belong to an organization. Uploading requirer an upload token with organization scope.
 *
 * @param organizationId The organization ID
 */
export const openAttachmentsUploadDialog = (organizationId: string, triggerRef: RefObject<HTMLButtonElement | null>) => {
  const UploadDialog = ({ organizationId }: { organizationId: string }) => {
    const { mutate: createAttachments } = useAttachmentCreateMutation();
    const { mutate: deleteAttachments } = useAttachmentDeleteMutation();

    const handleCallback = (result: UploadedUppyFile<'attachment'>) => {
      const attachments = parseUploadedAttachments(result, organizationId);
      // Save attachments
      createAttachments({ attachments, orgIdOrSlug: organizationId });

      // Close the upload dialog
      useDialoger.getState().remove('upload-attachment');
    };

    const handleSuccessesRetryCallback = async (result: UploadedUppyFile<'attachment'>, ids: string[]) => {
      handleCallback(result);
      deleteAttachments({ orgIdOrSlug: organizationId, ids });
    };

    return (
      <UploadUppy
        isPublic={false}
        uploadType="organization"
        organizationId={organizationId}
        restrictions={{ maxNumberOfFiles, allowedFileTypes: ['*/*'], maxTotalFileSize }}
        plugins={['webcam', 'image-editor', 'screen-capture', 'audio']}
        templateId="attachment"
        callback={handleCallback}
        onRetrySuccessCallback={handleSuccessesRetryCallback}
      />
    );
  };

  useDialoger.getState().create(
    <Suspense fallback={<Spinner noDelay className="my-44 h-12 w-12" />}>
      <UploadDialog organizationId={organizationId} />
    </Suspense>,
    {
      id: 'upload-attachment',
      triggerRef,
      drawerOnMobile: false,
      title: t('common:upload_item', { item: t('common:attachments').toLowerCase() }),
      description: t('common:upload_multiple.text', { item: t('common:attachments').toLowerCase(), count: maxNumberOfFiles }),
      className: 'md:max-w-xl',
    },
  );
};
