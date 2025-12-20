import type { Block, InlineContent, InlineContentSchema, StyleSchema } from '@blocknote/core';

const extractItemText = (item: InlineContent<InlineContentSchema, StyleSchema>): string => {
  return 'text' in item && typeof item.text === 'string' ? item.text : '';
};

type MediaBlockType = (typeof mediaBlockTypes)[number];
const mediaBlockTypes = ['audio', 'video', 'image', 'file'] as const;

const extractBlockText = (block: Block): string => {
  let text = '';

  const { content, children } = block;

  if (Array.isArray(content)) {
    const itemText = content.map(extractItemText);
    text += itemText.join(' ').trim();
  } else if (content?.type === 'tableContent' && Array.isArray(content.rows)) {
    const itemText = content.rows.flatMap((row) => {
      return row.cells.flatMap((cell) => {
        return 'content' in cell && Array.isArray(cell.content)
          ? cell.content.map(extractItemText).join(' ').trim()
          : '';
      });
    });

    text += itemText.join(' ').trim();
  } else if (mediaBlockTypes.includes(block.type as MediaBlockType)) {
    if ('name' in block.props && typeof block.props.name === 'string') {
      text += block.props.name;
    }
  }

  if (Array.isArray(children)) {
    const childText = children.reduce((result, block) => {
      return result + extractBlockText(block).trim();
    }, '');

    text += childText;
  }

  return text.trim();
};

export const parseBlocksText = (json: string) => {
  const blocks: Block[] = JSON.parse(json);

  return blocks.map(extractBlockText).join(' ').toLowerCase();
};
