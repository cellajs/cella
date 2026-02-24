import type { Block } from '@blocknote/core';

/**
 * Recursively extracts plain text from a BlockNote block,
 * including inline content, table content, file-based blocks, and children.
 */
export const getTextFromBlock = (block: Block): string => {
  const { content, children } = block;

  let text = '';

  // Extract text from content
  if (Array.isArray(content)) {
    text += content
      .map((item) => ('text' in item && typeof item.text === 'string' ? item.text : ''))
      .join(' ')
      .trim();
  } else if (content?.type === 'tableContent' && Array.isArray(content.rows)) {
    // Handle tableContent (rows and cells)
    text += content.rows
      .flatMap((row) =>
        row.cells.flatMap((cell) =>
          'content' in cell && Array.isArray(cell.content)
            ? cell.content.map((item) => ('text' in item && typeof item.text === 'string' ? item.text : '')).join(' ')
            : '',
        ),
      )
      .join(' ')
      .trim();
  } else if (
    // Handle file-based blocks: audio, image, video, file
    ['audio', 'video', 'image', 'file'].includes(block.type) &&
    'name' in block.props &&
    typeof block.props.name === 'string'
  ) {
    text += block.props.name;
  }

  // Process children recursively
  if (Array.isArray(children)) {
    const childrenText = children
      .map(getTextFromBlock)
      .filter((t) => t.trim().length > 0)
      .join(' ')
      .trim();

    if (childrenText) text += (text ? ' ' : '') + childrenText;
  }

  return text.trim();
};
