import { describe, expect, it } from 'vitest';
import { emptyTitleDocument, titleDocumentHasBody } from './title-document';

const text = (t: string) => ({ type: 'text', text: t, styles: {} });
const heading = (t: string, level = 1) => ({ type: 'heading', props: { level }, content: t ? [text(t)] : [] });
const paragraph = (t: string) => ({ type: 'paragraph', props: {}, content: t ? [text(t)] : [] });

describe('titleDocumentHasBody', () => {
  it('counts every block but the title and trailing empty blocks as body, media included', () => {
    const image = { type: 'image', props: { url: 'https://x/i.png' } };

    // A seed has no body, also as the editor leaves it, with a trailing empty paragraph.
    expect(titleDocumentHasBody(emptyTitleDocument(3))).toBe(false);
    expect(titleDocumentHasBody(JSON.stringify([heading(''), paragraph('')]))).toBe(false);

    // Media holds no inline content, yet is body: after the title, and as block 0, which then holds no title.
    expect(titleDocumentHasBody(JSON.stringify([heading('T'), image, paragraph('')]))).toBe(true);
    expect(titleDocumentHasBody(JSON.stringify([image]))).toBe(true);
  });
});
