import { t } from 'i18next';
// biome-ignore lint/style/noRestrictedImports: colocated mutation, imperative attachment creation called from drag-drop helpers.
import { createAttachments } from 'sdk';
import { appConfig } from 'shared';
import { parseUploadedAttachments } from '~/modules/attachment/helpers/parse-uploaded';
import { attachmentQueryKeys } from '~/modules/attachment/query';
import { toaster } from '~/modules/common/toaster/toaster';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';
import { useUploader } from '~/modules/common/uploader/use-uploader';
import { createStxForCreate } from '~/query/offline/stx-utils';
import { queryClient } from '~/query/query-client';

const maxNumberOfFiles = 20;
const maxTotalFileSize = maxNumberOfFiles * appConfig.uppy.defaultRestrictions.maxFileSize; // for maxNumberOfFiles files at 10MB max each

export const useAttachmentsUploadDialog = (tenantId: string, organizationId: string) => {
  const open = () => {
    const onComplete = async (result: UploadedUppyFile<'attachment'>) => {
      try {
        const attachments = parseUploadedAttachments(result, organizationId);

        if (attachments.length === 0) {
          toaster(t('error:create_resource', { resource: t('c:attachment').toLowerCase() }), 'error');
          useUploader.getState().remove();
          return;
        }

        // Create attachments via API with transaction metadata (stx embedded in each item)
        const stx = createStxForCreate();
        const body = attachments.map((att) => ({ ...att, stx }));
        await createAttachments({ path: { tenantId, organizationId: organizationId }, body });

        // Invalidate the cache to refresh the table
        queryClient.invalidateQueries({ queryKey: attachmentQueryKeys.list.base });

        useUploader.getState().remove();
      } catch (error) {
        toaster(t('error:create_resource', { resource: t('c:attachment').toLowerCase() }), 'error');
        useUploader.getState().remove();
      }
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

export const formatBytes = (bytes: string): string => {
  const parsedBytes = Number(bytes);

  if (parsedBytes <= 0 || Number.isNaN(parsedBytes)) return '0 B';

  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.floor(Math.log(parsedBytes) / Math.log(1024));

  // Show 2 decimal places for MB or higher, else round to whole number
  const formattedSize = (parsedBytes / 1024 ** index).toFixed(index > 1 ? 2 : 0);

  return `${formattedSize} ${sizes[index]}`;
};
