import { uploadTemplates } from '#/modules/me/helpers/upload-templates';
import { onlineManager } from '@tanstack/react-query';
import { t } from 'i18next';
import type { UploadedUppyFile } from '~/lib/imado/types';
import AttachmentsCarousel, { type CarouselItemData } from '~/modules/attachments/attachments-carousel';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster';
import { nanoid } from '~/utils/nanoid';

interface OpenAttachmentDialogParams {
  attachmentIndex: number;
  attachments: CarouselItemData[];
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

export const openAttachmentDialog = ({ attachmentIndex, attachments, triggerRef }: OpenAttachmentDialogParams) => {
  if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

  useDialoger.getState().create(
    <div className="flex flex-wrap relative -z-1 h-screen justify-center p-2 grow">
      <AttachmentsCarousel items={attachments} isDialog itemIndex={attachmentIndex} saveInSearchParams={false} />
    </div>,
    {
      id: 'attachment-dialog',
      triggerRef: triggerRef || { current: document.activeElement instanceof HTMLButtonElement ? document.activeElement : null },
      drawerOnMobile: false,
      className: 'min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0',
      headerClassName: 'absolute p-4 w-full backdrop-blur-xs bg-background/50',
      hideClose: true,
    },
  );
};

export const parseUploadedAttachments = (result: UploadedUppyFile<'attachment'>, organizationId: string, grouopId = nanoid()) => {
  const attachments = [];

  // Track file ids that we already processed
  const processedFileIds = new Set<string>();

  const processedSteps = uploadTemplates.attachment.use.filter((step) => step === ':original');

  // First, handle all processed steps
  for (const step of processedSteps) {
    const files = result[step];
    if (!files) continue;

    for (const { id, size, type, ext, url, original_name, original_id } of files) {
      attachments.push({
        id: id || nanoid(),
        url,
        size: String(size || 0),
        contentType: type || ext,
        filename: original_name || 'unknown',
        organizationId,
        type: step.startsWith('converted_') ? step.replace('converted_', '') : 'thumbnail', // 'image', 'audio', 'document', or 'thumbnail'
      });

      // Mark this file url as processed
      processedFileIds.add(original_id);
    }
  }

  // Now, handle any leftover original files that were NOT processed
  const originalFiles = result[':original'] || [];
  for (const { id, size, type, ext, url, original_name, original_id } of originalFiles) {
    // Already handled by processed steps, skip
    if (processedFileIds.has(original_id)) continue;

    attachments.push({
      id: id || nanoid(),
      url,
      size: String(size || 0),
      contentType: type || ext,
      filename: original_name || 'unknown',
      organizationId,
      type: 'raw', // fallback type for unprocessed original uploads (e.g., zip, csv, etc.)
    });
  }

  return attachments.length > 1 ? attachments.map((attachment) => ({ ...attachment, groupId: grouopId })) : attachments;
};
