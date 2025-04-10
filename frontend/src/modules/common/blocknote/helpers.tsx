import type { PropSchema, Props } from '@blocknote/core';
import type { DefaultReactSuggestionItem } from '@blocknote/react';
import DOMPurify from 'dompurify';
import type { CarouselItemData } from '~/modules/attachments/attachments-carousel';
import { openAttachmentDialog } from '~/modules/attachments/helpers';
import { customSlashIndexedItems, customSlashNotIndexedItems, menusTitleToAllowedType } from '~/modules/common/blocknote/blocknote-config';
import type { BasicBlockTypes, CellaCustomBlockTypes, CustomBlockNoteSchema, MenusItemsTitle } from '~/modules/common/blocknote/types';
import { nanoid } from '~/utils/nanoid';

export const getSortedSlashMenuItems = (items: DefaultReactSuggestionItem[], allowedBlockTypes: (CellaCustomBlockTypes | BasicBlockTypes)[]) => {
  const indexedItems: readonly string[] = customSlashIndexedItems;
  const notIndexedItems: readonly string[] = customSlashNotIndexedItems;

  // Apply the filter to customSlashIndexedItems and customSlashNotIndexedItems
  const slashMenuIndexed = indexedItems.filter((i) => isAllowedSlashMenu(i, allowedBlockTypes));
  const slashMenuNotIndexed = notIndexedItems.filter((i) => isAllowedSlashMenu(i, allowedBlockTypes));
  const sortList = [...slashMenuIndexed, ...slashMenuNotIndexed];
  const sortOrder = new Map(sortList.map((title, index) => [title, index]));

  const filteredAndSortedItems = items
    .filter(({ title }) => sortList.includes(title))
    .sort((a, b) => {
      const indexA = sortOrder.get(a.title);
      const indexB = sortOrder.get(b.title);
      return (indexA ?? Number.MAX_SAFE_INTEGER) - (indexB ?? Number.MAX_SAFE_INTEGER);
    });

  // Sort and filter items based on the pre-defined order.
  return {
    items: filteredAndSortedItems,
    indexedItemCount: slashMenuIndexed.length,
    originalItemCount: filteredAndSortedItems.length,
  };
};

// Filter function to check if the MenusItemsTitle has an allowed type
const isAllowedSlashMenu = (item: string, allowedTypes: (CellaCustomBlockTypes | BasicBlockTypes)[]) => {
  const allowedBlockTypes: readonly string[] = allowedTypes;
  const allowedType = menusTitleToAllowedType[item as MenusItemsTitle];
  return allowedType && allowedBlockTypes.includes(allowedType);
};

export const focusEditor = (editor: CustomBlockNoteSchema, blockId?: string) => {
  const lastBlock = editor.document[editor.document.length - 1];
  try {
    editor.focus();
    editor.setTextCursorPosition(blockId ?? lastBlock.id, 'end');
  } catch (err) {}
};

export const handleSubmitOnEnter = (editor: CustomBlockNoteSchema): CustomBlockNoteSchema['document'] | null => {
  const blocks = editor.document;
  // Get the last block and modify its content so we remove last \n
  const lastBlock = blocks[blocks.length - 1];
  if (Array.isArray(lastBlock.content)) {
    const lastBlockContent = lastBlock.content as { text: string }[];
    if (lastBlockContent.length > 0) lastBlockContent[0].text = lastBlockContent[0].text.replace(/\n$/, ''); // Remove the last newline character
    const updatedLastBlock = { ...lastBlock, content: lastBlockContent };
    return [...blocks.slice(0, -1), updatedLastBlock] as CustomBlockNoteSchema['document'];
  }
  return null;
};

export const updateSourcesFromDataUrl = (elementId: string, openPreviewDialog = true) => {
  const parentElement = document.getElementById(elementId);

  if (!parentElement) return;

  // to set tables column width and line break if it's empty
  for (const td of parentElement.querySelectorAll('td')) {
    const cell = td as HTMLTableCellElement;
    const width = cell.getAttribute('colwidth') ?? '120';
    cell.style.width = `${width}px`;

    const paragraph = cell.querySelector('p');
    if (paragraph && !paragraph?.innerText.length) {
      // If no <br> exists inside the <p>, add one
      const lineBreak = document.createElement('br');
      paragraph.appendChild(lineBreak);
    }
  }

  // Select all elements that have a 'data-url' attribute
  const elementsWithDataUrl = parentElement.querySelectorAll('[data-url]');
  // Exit early if no matching elements are found
  if (elementsWithDataUrl.length === 0) return;
  const attachments: CarouselItemData[] = [];

  const onElClick = (e: MouseEvent) => {
    if (!e.target || !openPreviewDialog) return;
    e.preventDefault();
    const target = e.target as HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
    // Find the slide based on the currentSrc of the target
    const slideNum = attachments.findIndex(({ url }) => url === target.currentSrc);
    openAttachmentDialog({ attachmentIndex: slideNum, attachments, triggerRef: { current: target as unknown as HTMLButtonElement } });
  };

  for (const element of elementsWithDataUrl) {
    let url = element.getAttribute('data-url');

    const contentType = element.getAttribute('data-content-type') || 'file';

    if (!url) continue;

    url = DOMPurify.sanitize(url);
    const filename = url.split('/').pop() || 'File';
    const id = nanoid();

    attachments.push({ id, url, filename, name: filename, contentType });

    switch (contentType) {
      case 'image': {
        const imageElement = element.querySelector('img');
        if (imageElement) {
          imageElement.onclick = onElClick;
          imageElement.setAttribute('src', url);
        }
        break;
      }

      case 'video': {
        const videoElement = element.querySelector('video');
        if (videoElement) {
          videoElement.onclick = onElClick;
          videoElement.setAttribute('src', url);
        }
        break;
      }

      case 'audio': {
        const audioElement = element.querySelector('audio');
        if (audioElement) {
          audioElement.onclick = onElClick;
          audioElement.setAttribute('src', url);
        }
        break;
      }

      case 'file': {
        const fileLinkElement = document.createElement('a');
        fileLinkElement.setAttribute('href', url);

        const fileName = element.getAttribute('data-name') || 'file';
        fileLinkElement.setAttribute('download', fileName);

        fileLinkElement.onclick = onElClick;
        // Move the original element (el) inside the <a> tag
        element.parentNode?.replaceChild(fileLinkElement, element);
        fileLinkElement.appendChild(element);
        break;
      }

      default:
        break;
    }
  }
};

// Get url property of el
export const getUrlFromProps = (props: Props<PropSchema>): string | null => {
  if (props && typeof props.url === 'string') return props.url;
  return null;
};

export const compareIsContentSame = (currentHtml: string, initialHtml: string) => normalizeHtml(currentHtml) === normalizeHtml(initialHtml);

/**
 * Normalizes HTML by sorting element attributes alphabetically and minimizing whitespace,
 * so that equivalent HTML structures can be compared reliably.
 */
const normalizeHtml = (html: string): string => {
  // Parse the input HTML into a document
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // List of attributes to ignore or normalize
  const attributesToNormalize = ['contenteditable', 'draggable', 'controls'];
  /**
   * Recursively sorts attributes of an element and its children.
   * @param el The element whose attributes should be normalized
   */
  const sortAttributes = (el: Element) => {
    if (el.hasAttributes()) {
      // Get all attributes
      const attrs = Array.from(el.attributes);
      // Sort attributes alphabetically by name
      const sortedAttrs = [...attrs]
        .filter((attr) => !attributesToNormalize.includes(attr.name)) // Remove attributes to ignore
        .sort((a, b) => a.name.localeCompare(b.name));

      // Remove existing attributes
      for (const attr of attrs) el.removeAttribute(attr.name);

      // Re-add attributes in sorted order
      for (const attr of sortedAttrs) el.setAttribute(attr.name, attr.value);
    }

    // Recurse through child elements
    for (const child of el.children) sortAttributes(child);
  };
  // Normalize top-level children
  for (const child of doc.body.children) sortAttributes(child);
  return doc.body.innerHTML.trim().replace(/\s+/g, ' ');
};
