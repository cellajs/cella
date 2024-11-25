import { JSDOM } from 'jsdom';

export const updateBlocknoteHTML = (passedHTML: string): string => {
  // Parse the HTML string with JSDOM
  const dom = new JSDOM(passedHTML);
  const document = dom.window.document;

  // Select all elements with a 'data-url' attribute within the document
  const elementsWithDataUrl = document.querySelectorAll('[data-url]');

  // Loop through each element with a 'data-url' attribute
  for (const el of elementsWithDataUrl) {
    const url = el.getAttribute('data-url');
    const contentType = el.getAttribute('data-content-type');

    if (!url) continue;

    if (contentType === 'image') {
      const imageElement = el.querySelector('img');
      if (imageElement) imageElement.setAttribute('src', url);
    }

    // Add if email send library support video & audio
    if (contentType === 'video') {
      const videoElement = el.querySelector('video');
      if (videoElement) videoElement.setAttribute('src', url);
    }

    if (contentType === 'audio') {
      const audioElement = el.querySelector('audio');
      if (audioElement) audioElement.setAttribute('src', url);
    }

    if (contentType === 'file') {
      const fileLinkElement = document.createElement('a');
      fileLinkElement.setAttribute('href', url);

      // Set the 'download' attribute using the 'data-name' attribute or other source
      const fileName = el.getAttribute('data-name') || 'file';
      fileLinkElement.setAttribute('download', fileName);

      // Move the original element (el) inside the <a> tag
      el.parentNode?.replaceChild(fileLinkElement, el);
      fileLinkElement.appendChild(el);
    }
  }

  return document.documentElement.outerHTML;
};
