export const blocknoteFieldIsDirty = (content: string) => {
  if (!content.length) return false;

  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/html');
  const emptyPElements = Array.from(doc.querySelectorAll('p.bn-inline-content'));

  // Check if any <p> element has non-empty text content
  return emptyPElements.some((el) => el.textContent && el.textContent.trim() !== '');
};
