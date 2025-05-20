import type { CustomBlock } from '~/modules/common/blocknote/types';

export const blocknoteFieldIsDirty = (strBlocks: string): boolean => {
  try {
    const blocks = JSON.parse(strBlocks) as CustomBlock[];

    const filteredBlocks = blocks.filter((b) => b !== undefined);
    return filteredBlocks.some(({ content, type, children, props }) => {
      const hasInlineContent = Array.isArray(content) && content.length > 0;

      const hasTableContent =
        type === 'table' &&
        content?.rows?.some((row) => row.cells.some((cell) => 'content' in cell && Array.isArray(cell.content) && cell.content.length > 0));

      const hasMediaProps = (type === 'audio' || type === 'video' || type === 'file' || type === 'image') && typeof props.name === 'string';

      const hasChildContent = children?.some((child) => Array.isArray(child.content) && child.content.length > 0) ?? false;

      return hasInlineContent || hasTableContent || hasMediaProps || hasChildContent;
    });
  } catch {
    return false;
  }
};
