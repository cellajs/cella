import { describe, expect, it } from 'vitest';
import { emptyTitleDocument, splitTitleBlocks, titleFromBlocks } from './forced-title';

const text = (t: string) => ({ type: 'text', text: t, styles: {} });
const heading = (t: string, level = 1) => ({ type: 'heading', props: { level }, content: t ? [text(t)] : [] });
const paragraph = (t: string) => ({ type: 'paragraph', props: {}, content: t ? [text(t)] : [] });

describe('titleFromBlocks', () => {
  it('reads the first block text', () => {
    expect(titleFromBlocks(JSON.stringify([heading('My item'), paragraph('body')]))).toBe('My item');
  });

  it('collects nested inline content (links)', () => {
    const linked = {
      type: 'heading',
      props: { level: 1 },
      content: [text('See '), { type: 'link', href: 'https://x', content: [text('this')] }],
    };
    expect(titleFromBlocks(JSON.stringify([linked]))).toBe('See this');
  });

  it('is empty for an empty seed document (any title level) and safe on garbage', () => {
    expect(titleFromBlocks(emptyTitleDocument())).toBe('');
    expect(titleFromBlocks(emptyTitleDocument(2))).toBe('');
    expect(titleFromBlocks('not json')).toBe('');
    expect(titleFromBlocks('[]')).toBe('');
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
