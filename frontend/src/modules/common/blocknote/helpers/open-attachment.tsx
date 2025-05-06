import type { CarouselItemData } from '~/modules/attachments/attachments-carousel';
import { openAttachmentDialog } from '~/modules/attachments/helpers';
import { getUrlFromProps } from '~/modules/common/blocknote/helpers/url-related';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';
import { nanoid } from '~/utils/nanoid';

export const openAttachment = (
  event: React.MouseEvent<Element>,
  editor: CustomBlockNoteEditor,
  altClickOpensPreview: boolean,
  blockNoteRef: React.RefObject<HTMLDivElement | null>,
) => {
  if (!altClickOpensPreview || !event.altKey) return;
  event.preventDefault();
  editor.formattingToolbar.closeMenu();

  const { props } = editor.getTextCursorPosition().block;

  const url = getUrlFromProps(props);
  if (!url || url.length === 0) return;
  const newAttachments: CarouselItemData[] = [];

  // Collect attachments based on valid file types
  editor.forEachBlock(({ type, props }) => {
    const blockUrl = getUrlFromProps(props);

    if (blockUrl && blockUrl.length > 0) {
      const filename = blockUrl.split('/').pop() || 'File';
      newAttachments.push({ id: nanoid(), url: blockUrl, filename, name: filename, contentType: type });
    }
    return true;
  });

  const attachmentNum = newAttachments.findIndex(({ url: newUrl }) => newUrl === url);
  openAttachmentDialog({
    attachmentIndex: attachmentNum,
    attachments: newAttachments,
    triggerRef: blockNoteRef as React.RefObject<null>,
  });
};
