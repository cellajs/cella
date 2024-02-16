import { Editor } from '@tiptap/react';

import { CodeBlock, Figcaption, HorizontalRule, ImageBlock, ImageUpload, Link } from '../../extensions';
// import { TableOfContentsNode } from '../../extensions/TableOfContentsNode';

export const isTableGripSelected = (node: HTMLElement) => {
  let container = node;

  while (container && !['TD', 'TH'].includes(container.tagName)) {
    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    container = container.parentElement!;
  }

  const gripColumn = container?.querySelector?.('a.grip-column.selected');
  const gripRow = container?.querySelector?.('a.grip-row.selected');

  if (gripColumn || gripRow) {
    return true;
  }

  return false;
};

export const isCustomNodeSelected = (editor: Editor, node: HTMLElement) => {
  const customNodes = [
    HorizontalRule.name,
    ImageBlock.name,
    ImageUpload.name,
    CodeBlock.name,
    ImageBlock.name,
    Link.name,
    // AiWriter.name,
    // AiImage.name,
    Figcaption.name,
    // TableOfContentsNode.name,
  ];

  return customNodes.some((type) => editor.isActive(type)) || isTableGripSelected(node);
};

export default isCustomNodeSelected;
