import type { Block, PropSchema, Props } from '@blocknote/core';
import type { CustomBlockNoteSchema } from '~/modules/common/blocknote/types';
import { type Slides, openCarouselDialog } from '~/modules/common/carousel/carousel-dialog';

export const getContentAsString = (blocks: Block[]) => {
  const blocksStringifyContent = blocks
    .map((block) => {
      if (Array.isArray(block.content)) return (block.content[0] as { text: string } | undefined)?.text;
      return block.type;
    })
    .join('');
  return blocksStringifyContent;
};

export const focusEditor = (editor: CustomBlockNoteSchema, blockId?: string) => {
  const lastBlock = editor.document[editor.document.length - 1];
  editor.focus();
  editor.setTextCursorPosition(blockId ?? lastBlock.id, 'end');
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

  // Select all elements that have a 'data-url' attribute
  const elementsWithDataUrl = parentElement.querySelectorAll('[data-url]');
  // Exit early if no matching elements are found
  if (elementsWithDataUrl.length === 0) return;
  const urls: Slides[] = [];

  const onElClick = (e: MouseEvent) => {
    if (!e.target || !openPreviewDialog) return;
    e.preventDefault();
    const target = e.target as HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
    // Find the slide based on the currentSrc of the target
    const slideNum = urls.findIndex(({ src }) => src === target.currentSrc);

    openCarouselDialog(slideNum, urls);
  };

  for (const element of elementsWithDataUrl) {
    const url = element.getAttribute('data-url');
    const contentType = element.getAttribute('data-content-type') || 'file';

    if (!url) continue;

    urls.push({ src: url, fileType: contentType });

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

// get url property of el
export const getUrlFromProps = (props: Props<PropSchema>): string | null => {
  if (props && typeof props.url === 'string') return props.url;
  return null;
};
