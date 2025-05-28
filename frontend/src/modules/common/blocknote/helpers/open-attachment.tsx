import type { CarouselItemData } from '~/modules/attachments/attachments-carousel';
import { openAttachmentDialog } from '~/modules/attachments/helpers';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';

export const openAttachment = async (
  event: React.MouseEvent<Element>,
  editor: CustomBlockNoteEditor,
  blockNoteRef: React.RefObject<HTMLDivElement | null>,
) => {
  event.preventDefault();
  editor.formattingToolbar.closeMenu();

  const {
    block: { props },
  } = editor.getTextCursorPosition();

  if (!props || !('url' in props) || !props.url.length) return;

  const newAttachments: CarouselItemData[] = [];

  // Iterate through all blocks and collect attachments
  editor.forEachBlock(({ id, props, type: contentType }) => {
    if (!('url' in props)) return true;

    const { url, name } = props;
    if (url.length > 0) newAttachments.push({ id, url, filename: name, name, contentType });

    return true; // keep iterating
  });

  const attachmentIndex = newAttachments.findIndex(({ url }) => url === props.url);

  const attachments = await Promise.all(
    newAttachments.map(async (attachment) => ({
      ...attachment,
      url: editor.resolveFileUrl ? await editor.resolveFileUrl(attachment.url) : attachment.url,
    })),
  );

  openAttachmentDialog({ attachmentIndex, attachments, triggerRef: blockNoteRef as React.RefObject<null> });
};
