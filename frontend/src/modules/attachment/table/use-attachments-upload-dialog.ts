import i18n from 'i18next';
import { appConfig } from 'shared';
import { maxFilesPerUpload as maxNumberOfFiles } from 'shared/utils/upload-visibility';
import { parseUploadedAttachments } from '~/modules/attachment/helpers/parse-uploaded';
import { useAttachmentCreateMutation } from '~/modules/attachment/query';
import { toaster } from '~/modules/common/toaster/toaster';
import type { UploadResults } from '~/modules/common/uploader/types';
import { uploader } from '~/modules/common/uploader/use-uploader';

const maxTotalFileSize = maxNumberOfFiles * appConfig.uppy.defaultRestrictions.maxFileSize;

export const useAttachmentsUploadDialog = (
  tenantId: string,
  organizationId: string,
  /** Home channel id column and the `public` flag for uploads into a channel. */
  placement?: Record<string, string | boolean | null>,
) => {
  const createAttachments = useAttachmentCreateMutation(tenantId, organizationId);

  const open = () => {
    const onComplete = async (result: UploadResults<'attachment'>) => {
      const attachments = parseUploadedAttachments(result, organizationId, placement);

      // Close the uploader either way; the optimistic row is what the user watches from here.
      uploader.getState().remove();

      if (attachments.length === 0) {
        toaster.error(i18n.t('error:create_resource', { resource: i18n.t('c:attachment').toLowerCase() }));
        return;
      }

      // The mutation gives optimistic insertion, SSE-safe upsert and offline replay; a direct request could upload bytes without creating the row.
      createAttachments.mutate(attachments);
    };

    const item = i18n.t('c:attachment_other').toLowerCase();
    uploader.getState().create({
      personalUpload: false,
      organizationId,
      templateId: 'attachment',
      restrictions: { maxNumberOfFiles, maxTotalFileSize, allowedFileTypes: ['*/*'] },
      plugins: ['webcam', 'image-editor', 'screen-capture', 'audio', 'url'],
      onComplete,
      title: i18n.t('c:upload_item', { item }),
      description: i18n.t('c:upload_multiple.text', { item, count: maxNumberOfFiles }),
    });
  };

  return { open };
};
