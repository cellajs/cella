import type { CarouselItemData } from '~/modules/attachment/attachments-carousel';
import { openAttachmentDialog } from '~/modules/attachment/dialog/open-attachment-dialog';
import { resolveAttachmentUrl } from '~/modules/attachment/helpers/resolve-url';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';

/** Collected media block plus the attachment ID for resolving its full-size variant. */
type MediaBlock = CarouselItemData & { attachmentId?: string };

/** Opens editor media in a carousel starting at the clicked attachment. */
export const openAttachment = async (
  editor: CustomBlockNoteEditor,
  blockNoteRef: React.RefObject<HTMLDivElement | null>,
  clickedSrc?: string,
) => {
  const mediaBlocks: MediaBlock[] = [];

  // Collect all media blocks from the editor
  editor.forEachBlock(({ id, props, type: contentType }) => {
    if (!('url' in props) || !props.url) return true;

    const { url, name } = props as { url: string; name?: string };
    const attachmentId =
      'attachmentId' in props && typeof props.attachmentId === 'string' ? props.attachmentId : undefined;
    mediaBlocks.push({ id, url, filename: name || '', name: name || '', contentType, attachmentId });

    return true;
  });

  if (mediaBlocks.length === 0) return;

  // Resolve display URLs. Inline blocks may reference a lightweight thumbnail, so the full-screen
  // viewer resolves the converted/original variant by attachment id when available; the stored ref
  // (cloud key or local blob) is the fallback for blocks that predate the id linkage.
  const attachments = await Promise.all(
    mediaBlocks.map(async ({ attachmentId, ...block }) => {
      const fullSize = attachmentId
        ? (await resolveAttachmentUrl(attachmentId, null, { preferredVariant: 'converted' }))?.url
        : undefined;
      const url = fullSize ?? (editor.resolveFileUrl ? await editor.resolveFileUrl(block.url) : block.url);
      return { ...block, url };
    }),
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
