import { t } from 'i18next';
import { appConfig } from 'shared';
import { parseUploadedAttachments } from '~/modules/attachment/helpers/parse-uploaded';
import { useAttachmentCreateMutation } from '~/modules/attachment/query';
import { toaster } from '~/modules/common/toaster/toaster';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';
import { useUploader } from '~/modules/common/uploader/use-uploader';

const maxNumberOfFiles = 20;
const maxTotalFileSize = maxNumberOfFiles * appConfig.uppy.defaultRestrictions.maxFileSize; // for maxNumberOfFiles files at 10MB max each

export const useAttachmentsUploadDialog = (tenantId: string, organizationId: string) => {
  const createAttachments = useAttachmentCreateMutation(tenantId, organizationId);

  const open = () => {
    const onComplete = async (result: UploadedUppyFile<'attachment'>) => {
      const attachments = parseUploadedAttachments(result, organizationId);

      // Close the uploader either way; the optimistic row is what the user watches from here.
      useUploader.getState().remove();

      if (attachments.length === 0) {
        toaster(t('error:create_resource', { resource: t('c:attachment').toLowerCase() }), 'error');
        return;
      }

      // The mutation provides the optimistic row, the SSE-race-safe upsert, and offline replay. While
      // offline the mutation pauses with the row already in cache and fires on reconnect. A
      // direct call rejects offline, leaving bytes that upload later with no attachment row to
      // attach them to. Errors surface via the mutation's own onError toast.
      createAttachments.mutate(attachments);
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
