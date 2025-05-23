import { uploadTemplates } from '#/lib/transloadit/templates';

import { onlineManager } from '@tanstack/react-query';
import { t } from 'i18next';
import AttachmentsCarousel, { type CarouselItemData } from '~/modules/attachments/attachments-carousel';
import type { AttachmentToInsert } from '~/modules/attachments/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster';
import type { UploadedUppyFile } from '~/modules/common/uploader/types';
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

export const parseUploadedAttachments = (result: UploadedUppyFile<'attachment'>, organizationId: string, groupId = nanoid()) => {
  const uploadedAttachments: AttachmentToInsert[] = [];

  // Process original files
  const originalFiles = result[':original'] || [];
  for (const { size, url, mime, ext, type, original_name, original_id } of originalFiles) {
    uploadedAttachments.push({
      id: original_id || nanoid(),
      originalKey: url,
      size: String(size || 0),
      contentType: mime,
      filename: original_name || 'unknown',
      organizationId,
      type: type ?? ext,
    });
  }
  // Process all converted and thumbnail variants
  const processSteps = uploadTemplates.attachment.use.filter((step) => step !== ':original');

  for (const step of processSteps) {
    const processFiles = result[step] || [];
    if (!processFiles.length) continue;

    for (const { url, mime, type, original_id } of processFiles) {
      const target = uploadedAttachments.find((a) => a.id === original_id);
      if (!target) continue;

      if (step.includes('converted_')) {
        target.convertedKey = url;
        target.convertedContentType = mime;
        if (type) target.type = type;
      }

      if (step.includes('thumb_')) target.thumbnailKey = url;
    }
  }

  return uploadedAttachments.length > 1 ? uploadedAttachments.map((attachment) => ({ ...attachment, groupId })) : uploadedAttachments;
};
