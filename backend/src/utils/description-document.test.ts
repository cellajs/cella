import { describe, expect, it } from 'vitest';
import { keywordsFromDocument, nameFromDocument } from './description-document';

const doc = (title: string, body?: string) =>
  JSON.stringify([
    { type: 'heading', props: { level: 3 }, content: [{ type: 'text', text: title, styles: {} }] },
    ...(body ? [{ type: 'paragraph', content: [{ type: 'text', text: body, styles: {} }] }] : []),
  ]);

describe('nameFromDocument', () => {
  it('reads the title from block 0', () => {
    expect(nameFromDocument(doc('Sprint retro', 'body text'))).toBe('Sprint retro');
  });

  it('trims surrounding whitespace', () => {
    expect(nameFromDocument(doc('  padded  '))).toBe('padded');
  });

  it('is empty for a null, unparseable or non-array description', () => {
    expect(nameFromDocument(null)).toBe('');
    expect(nameFromDocument('<p>legacy html</p>')).toBe('');
    expect(nameFromDocument('{"type":"heading"}')).toBe('');
  });
});

describe('keywordsFromDocument', () => {
  it('includes the title exactly once, since it is block 0', () => {
    const keywords = keywordsFromDocument(doc('Retro', 'body text'));
    expect(keywords).toContain('Retro');
    expect(keywords).toContain('body text');
    expect(keywords.match(/Retro/g)).toHaveLength(1);
  });

  it('caps at the column budget', () => {
    expect(keywordsFromDocument(doc('t', 'x '.repeat(2000))).length).toBeLessThanOrEqual(900);
  });

  it('is empty for a null or unparseable description', () => {
    expect(keywordsFromDocument(null)).toBe('');
    expect(keywordsFromDocument('<p>legacy html</p>')).toBe('');
  });
});
