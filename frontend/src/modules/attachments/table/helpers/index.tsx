import { t } from 'i18next';
import { Suspense } from 'react';
import type { UploadedUppyFile } from '~/lib/imado';
import { useAttachmentCreateMutation } from '~/modules/attachments/query-mutations';
import UploadUppy from '~/modules/attachments/upload/upload-uppy';
import { dialog } from '~/modules/common/dialoger/state';
import { nanoid } from '~/utils/nanoid';

export const formatBytes = (bytes: string): string => {
  const parsedBytes = Number(bytes);

  if (parsedBytes <= 0 || Number.isNaN(parsedBytes)) return '0 B';

  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.floor(Math.log(parsedBytes) / Math.log(1024));

  // Show 2 decimal places for MB or higher, else round to whole number
  const formattedSize = (parsedBytes / 1024 ** index).toFixed(index > 1 ? 2 : 0);

  return `${formattedSize} ${sizes[index]}`;
};

// Open the upload dialog
export const openUploadDialog = (organizationId: string) => {
  const maxAttachmentsUpload = 20;

  const UploadDialog = () => {
    const { mutate: createAttachment } = useAttachmentCreateMutation();

    const handleCallback = (result: UploadedUppyFile[]) => {
      const attachments = result.map((a) => ({
        id: nanoid(),
        url: a.url,
        size: String(a.file.size || 0),
        contentType: a.file.type,
        filename: a.file.name || 'unknown',
        organizationId,
      }));

      createAttachment({ attachments, orgIdOrSlug: organizationId });
      dialog.remove(true, 'upload-attachment');
    };

    return (
      <UploadUppy
        isPublic
        uploadType="personal"
        uppyOptions={{
          restrictions: {
            maxFileSize: 10 * 1024 * 1024, // 10MB
            maxNumberOfFiles: maxAttachmentsUpload,
            allowedFileTypes: ['*/*'],
            minFileSize: null,
            maxTotalFileSize: 10 * 1024 * 1024 * maxAttachmentsUpload, // for maxAttachmentsUpload files at 10MB max each
            minNumberOfFiles: null,
            requiredMetaFields: [],
          },
        }}
        plugins={['webcam', 'image-editor', 'screen-capture', 'audio']}
        imageMode="attachment"
        callback={handleCallback}
      />
    );
  };

  dialog(
    <Suspense>
      <UploadDialog />
    </Suspense>,
    {
      id: 'upload-attachment',
      drawerOnMobile: false,
      title: t('common:upload_item', { item: t('common:attachments').toLowerCase() }),
      description: t('common:upload_multiple.text', { item: t('common:attachments').toLowerCase(), count: maxAttachmentsUpload }),
      className: 'md:max-w-xl',
    },
  );
};
