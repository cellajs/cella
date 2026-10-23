import { type CustomBlock, isMediaBlock } from '~/modules/common/blocknote/types';

/** Whether the stored blocks hold any content: text, a filled table cell, a media block, or a child block's text. */
export const blocknoteFieldIsDirty = (strBlocks: string): boolean => {
  try {
    const blocks = JSON.parse(strBlocks) as CustomBlock[];

    return blocks.some((block) => {
      const { content, type, children } = block;
      const hasInlineContent = Array.isArray(content) && content.length > 0;

      const hasTableContent =
        type === 'table' &&
        content?.rows?.some((row) => row.cells.some((cell) => 'content' in cell && Array.isArray(cell.content) && cell.content.length > 0));

      const hasMediaProps = isMediaBlock(block) && typeof block.props.name === 'string';

      const hasChildContent = children?.some((child) => Array.isArray(child.content) && child.content.length > 0) ?? false;

      return hasInlineContent || hasTableContent || hasMediaProps || hasChildContent;
    });
  } catch {
    return false;
  }
};
