import DOMPurify from 'dompurify';
import type { CarouselItemData } from '~/modules/attachments/attachments-carousel';
import { openAttachmentDialog } from '~/modules/attachments/helpers';
import { nanoid } from '~/utils/nanoid';

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
