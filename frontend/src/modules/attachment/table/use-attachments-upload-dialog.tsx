import { t } from 'i18next';
import { appConfig } from 'shared';
import { parseUploadedAttachments } from '~/modules/attachment/helpers/parse-uploaded';
import { useAttachmentCreateMutation } from '~/modules/attachment/query';
import { toaster } from '~/modules/common/toaster/toaster';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';
import { useUploader } from '~/modules/common/uploader/use-uploader';

const maxNumberOfFiles = 20;
const maxTotalFileSize = maxNumberOfFiles * appConfig.uppy.defaultRestrictions.maxFileSize; // for maxNumberOfFiles files at 10MB max each

export const useAttachmentsUploadDialog = (
  tenantId: string,
  organizationId: string,
  /** Placement seam: home channel id column for uploads into a sub-organization channel. */
  placement?: Record<string, string>,
) => {
  const createAttachments = useAttachmentCreateMutation(tenantId, organizationId);

  const open = () => {
    const onComplete = async (result: UploadedUppyFile<'attachment'>) => {
      const attachments = parseUploadedAttachments(result, organizationId, placement);

      // Close the uploader either way; the optimistic row is what the user watches from here.
      useUploader.getState().remove();

      if (attachments.length === 0) {
        toaster.error(t('error:create_resource', { resource: t('c:attachment').toLowerCase() }));
        return;
      }

      // The mutation gives optimistic insertion, SSE-safe upsert and offline replay; a direct request could upload bytes without creating the row.
      createAttachments.mutate(attachments);
    };

    useUploader.getState().create({
      id: 'upload-attachment',
      publicBucket: false,
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
      title: t('c:upload_item', {
        item: t('c:attachment_other').toLowerCase(),
      }),
      description: t('c:upload_multiple.text', {
        item: t('c:attachment_other').toLowerCase(),
        count: maxNumberOfFiles,
      }),
    });
  };

  return { open };
};
