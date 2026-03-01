import type { CarouselItemData } from '~/modules/attachment/carousel';
import { openAttachmentDialog } from '~/modules/attachment/dialog/helpers';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';

/**
 * Opens an attachment dialog with carousel for media in the editor.
 * Collects all media blocks and displays them in a carousel.
 *
 * @param clickedSrc - Optional: the src of clicked media to start at that index
 */
export const openAttachment = async (
  editor: CustomBlockNoteEditor,
  blockNoteRef: React.RefObject<HTMLDivElement | null>,
  clickedSrc?: string,
) => {
  const mediaBlocks: CarouselItemData[] = [];

  // Collect all media blocks from the editor
  editor.forEachBlock(({ id, props, type: contentType }) => {
    if (!('url' in props) || !props.url) return true;

    const { url, name } = props as { url: string; name?: string };
    mediaBlocks.push({ id, url, filename: name || '', name: name || '', contentType });

    return true;
  });

  if (mediaBlocks.length === 0) return;

  // Resolve all URLs (handles both cloud keys and local blob storage)
  const attachments = await Promise.all(
    mediaBlocks.map(async (block) => ({
      ...block,
      url: editor.resolveFileUrl ? await editor.resolveFileUrl(block.url) : block.url,
    })),
  );

  // Find index of clicked media, or default to first
  const attachmentIndex = clickedSrc
    ? Math.max(
        0,
        attachments.findIndex(({ url }) => url === clickedSrc),
      )
    : 0;

  openAttachmentDialog({
    attachmentIndex,
    attachments,
    triggerRef: blockNoteRef as React.RefObject<null>,
  });
};
