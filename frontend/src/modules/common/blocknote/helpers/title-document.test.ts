import { describe, expect, it } from 'vitest';
import { emptyTitleDocument, splitTitleBlocks, titleDocumentHasBody } from './title-document';

const text = (t: string) => ({ type: 'text', text: t, styles: {} });
const heading = (t: string, level = 1) => ({ type: 'heading', props: { level }, content: t ? [text(t)] : [] });
const paragraph = (t: string) => ({ type: 'paragraph', props: {}, content: t ? [text(t)] : [] });

describe('emptyTitleDocument', () => {
  it('seeds one empty heading at the given level, with no body', () => {
    expect(JSON.parse(emptyTitleDocument(2))).toEqual([heading('', 2)]);
    expect(titleDocumentHasBody(emptyTitleDocument())).toBe(false);
  });
});

describe('splitTitleBlocks', () => {
  it('splits title from body', () => {
    const { name, body } = splitTitleBlocks([heading('Title'), paragraph('one'), paragraph('two')]);
    expect(name).toBe('Title');
    expect(body).toHaveLength(2);
  });

  it('drops trailing empty paragraphs but keeps interior ones', () => {
    const { body } = splitTitleBlocks([heading('T'), paragraph('a'), paragraph(''), paragraph('b'), paragraph('')]);
    expect(body.map((b) => (Array.isArray(b.content) ? b.content.length : -1))).toEqual([1, 0, 1]);
  });

  it('keeps trailing media blocks (no inline content array)', () => {
    const image = { type: 'image', props: { url: 'https://x/i.png' } };
    const { body } = splitTitleBlocks([heading('T'), image]);
    expect(body).toEqual([image]);
  });

  it('keeps a media block 0 in the body, since it holds no title', () => {
    const image = { type: 'image', props: { url: 'https://x/i.png' } };
    const { name, body } = splitTitleBlocks([image, paragraph('caption'), paragraph('')]);
    expect(name).toBe('');
    expect(body).toEqual([image, paragraph('caption')]);
    expect(titleDocumentHasBody(JSON.stringify([image]))).toBe(true);
  });

  it('empty body yields no blocks; whitespace title trims to empty', () => {
    const { name, body } = splitTitleBlocks([heading('  '), paragraph('')]);
    expect(name).toBe('');
    expect(body).toEqual([]);
  });

  it('keeps a checklist-first body intact', () => {
    const check = { type: 'checklistItem', props: { checked: false }, content: [text('todo')] };
    const { name, body } = splitTitleBlocks([heading('T'), check, paragraph('after')]);
    expect(name).toBe('T');
    expect(body).toHaveLength(2);
  });
});
