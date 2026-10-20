import type { CarouselItemData } from '~/modules/attachment/attachments-carousel';
import { openAttachmentDialog } from '~/modules/attachment/dialog/open-attachment-dialog';
import { getPendingUpload, PendingUploadError } from '~/modules/attachment/helpers/pending-uploads';
import { resolveAttachmentUrl } from '~/modules/attachment/helpers/resolve-url';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';

/** Collected media block plus the attachment ID for resolving its full-size variant. */
type MediaBlock = CarouselItemData & { attachmentId?: string };

/** Opens editor media in a carousel starting at the clicked attachment. */
export const openAttachment = async (editor: CustomBlockNoteEditor, blockNoteRef: React.RefObject<HTMLDivElement | null>, clickedSrc?: string) => {
  const mediaBlocks: MediaBlock[] = [];

  editor.forEachBlock(({ id, props, type: contentType }) => {
    if (!('url' in props) || !props.url) return true;

    const { url, name } = props as { url: string; name?: string };
    const attachmentId = 'attachmentId' in props && typeof props.attachmentId === 'string' ? props.attachmentId : undefined;
    mediaBlocks.push({ id, url, filename: name || '', name: name || '', contentType, attachmentId });

    return true;
  });

  if (mediaBlocks.length === 0) return;

  // Inline blocks may reference a thumbnail, so resolve the converted variant by attachment id and fall back to the stored ref.
  const resolved = await Promise.all(
    mediaBlocks.map(async ({ attachmentId, ...block }): Promise<CarouselItemData> => {
      try {
        const fullSize = attachmentId ? (await resolveAttachmentUrl(attachmentId, null, { preferredVariant: 'converted' }))?.url : undefined;
        const url = fullSize ?? (editor.resolveFileUrl ? await editor.resolveFileUrl(block.url) : block.url);
        return { ...block, url };
      } catch (error) {
        if (error instanceof PendingUploadError) return { ...block, url: '', pendingUpload: getPendingUpload(error.attachmentId) };
        return { ...block, url: '' };
      }
    }),
  );
  // A slide with neither a file nor a pending upload to explain would spin forever.
  const attachments = resolved.filter(({ url, pendingUpload }) => url || pendingUpload);
  if (attachments.length === 0) return;

  const attachmentIndex = clickedSrc
    ? Math.max(
        0,
        attachments.findIndex(({ url }) => url === clickedSrc),
      )
    : 0;

  openAttachmentDialog({ attachmentIndex, attachments, triggerRef: blockNoteRef as React.RefObject<null> });
};
