import type { RefObject } from 'react';
import type { CarouselItemData } from '~/modules/attachment/attachments-carousel';
import { openAttachmentDialog } from '~/modules/attachment/dialog/open-attachment-dialog';
import { getPendingUpload, PendingUploadError } from '~/modules/attachment/helpers/pending-uploads';
import { resolveAttachmentUrl } from '~/modules/attachment/helpers/resolve-url';
import { type CustomBlockNoteEditor, isMediaBlock } from '~/modules/common/blocknote/types';

/** A media block's carousel item, plus the attachment id that resolves its full-size variant. */
type MediaSlide = CarouselItemData & { attachmentId?: string };

/** Opens the carousel at the item of block `blockId`, else at the first. */
export const openMediaCarousel = (attachments: CarouselItemData[], blockId?: string, triggerRef?: RefObject<HTMLDivElement | null>) => {
  const attachmentIndex = Math.max(
    0,
    attachments.findIndex(({ id }) => id === blockId),
  );
  openAttachmentDialog({ attachmentIndex, attachments, triggerRef: triggerRef as RefObject<null> | undefined });
};

/** Opens editor media in a carousel starting at the media of block `blockId`. */
export const openAttachment = async (editor: CustomBlockNoteEditor, blockId?: string, triggerRef?: RefObject<HTMLDivElement | null>) => {
  const slides: MediaSlide[] = [];

  editor.forEachBlock((block) => {
    if (!isMediaBlock(block) || !block.props.url) return true;

    const { id, type: contentType, props } = block;
    const attachmentId = 'attachmentId' in props && typeof props.attachmentId === 'string' ? props.attachmentId : undefined;
    slides.push({ id, url: props.url, filename: props.name, name: props.name, contentType, attachmentId });

    return true;
  });

  if (slides.length === 0) return;

  // Inline blocks may reference a thumbnail, so resolve the converted variant by attachment id and fall back to the stored ref.
  const resolved = await Promise.all(
    slides.map(async ({ attachmentId, ...slide }): Promise<CarouselItemData> => {
      try {
        const fullSize = attachmentId ? (await resolveAttachmentUrl(attachmentId, null, { preferredVariant: 'converted' }))?.url : undefined;
        const url = fullSize ?? (editor.resolveFileUrl ? await editor.resolveFileUrl(slide.url) : slide.url);
        return { ...slide, url };
      } catch (error) {
        if (error instanceof PendingUploadError) return { ...slide, url: '', pendingUpload: getPendingUpload(error.attachmentId) };
        return { ...slide, url: '' };
      }
    }),
  );
  // A slide with neither a file nor a pending upload to explain would spin forever.
  const attachments = resolved.filter(({ url, pendingUpload }) => url || pendingUpload);
  if (attachments.length === 0) return;

  openMediaCarousel(attachments, blockId, triggerRef);
};
