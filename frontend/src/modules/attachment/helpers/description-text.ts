import type { Block } from '@blocknote/core';
import { getTextFromBlock } from 'shared/blocknote';

/** Plain text of a stored description (blocks JSON) for captions and cells; empty for no or unparseable content. */
export function attachmentDescriptionText(description: string | null | undefined): string {
  if (!description) return '';
  try {
    const blocks: unknown = JSON.parse(description);
    if (!Array.isArray(blocks)) return '';
    return blocks
      .map((block) => getTextFromBlock(block as Block))
      .filter(Boolean)
      .join(' ');
  } catch {
    return '';
  }
}
