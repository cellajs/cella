import type { PartialBlock } from '@blocknote/core';

/** The most lines pasted text may add to a document before it becomes a file, for an editor that names no limit. */
export const pastedTextMaxLines = 40;

/** Characters of a text file its block keeps, to show the file's first lines without fetching it. */
export const excerptLength = 300;

/** Whether pasted text is structured data: a JSON object or array that holds something. It becomes a file whatever its size. */
export const isStructuredText = (text: string): boolean => {
  const trimmed = text.trim();
  if (!/^[[{]/.test(trimmed)) return false;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length > 0;
  } catch {
    return false;
  }
};

/**
 * The lines `text` takes in `blockElement` at its current width, each line of the text wrapping into as many rows as
 * its measured width needs. Counting stops once past `stopAfter`. Without a canvas (a test) every line counts once.
 */
export const countRenderedLines = (text: string, blockElement: HTMLElement | null | undefined, stopAfter: number): number => {
  const lines = text.split('\n');
  const context = blockElement?.ownerDocument.createElement('canvas').getContext('2d');
  const width = blockElement?.clientWidth ?? 0;
  if (!blockElement || !context || width <= 0) return lines.length;

  const { fontStyle, fontWeight, fontSize, fontFamily } = getComputedStyle(blockElement);
  context.font = `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;

  let count = 0;
  for (const line of lines) {
    count += Math.max(1, Math.ceil(context.measureText(line).width / width));
    if (count > stopAfter) break;
  }
  return count;
};

/** A file holding pasted text: JSON for structured data, plain text otherwise, named after its first words. */
export const fileFromPastedText = (text: string): File => {
  if (isStructuredText(text)) return new File([text], 'pasted-data.json', { type: 'application/json' });
  const firstWords = text.trim().split('\n', 1)[0].slice(0, 40).trim();
  return new File([text], `${firstWords || 'pasted-text'}.txt`, { type: 'text/plain' });
};

/** A text file's content as blocks: a JSON code block for structured data, else a paragraph per line that holds text. */
export const blocksFromText = (text: string): PartialBlock[] =>
  isStructuredText(text)
    ? [{ type: 'codeBlock', props: { language: 'json' }, content: text.trim() }]
    : text
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => ({ type: 'paragraph', content: line }));
