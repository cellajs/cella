import type { Block } from '@blocknote/core';
import { describe, expect, it } from 'vitest';
import { getSearchableTextFromBlock, getSearchableTextFromUrl } from './text-from-block';

describe('getSearchableTextFromUrl', () => {
  it('extracts host and path tokens but skips query strings and fragments', () => {
    const text = getSearchableTextFromUrl(
      'https://linear.app/acme/issue/SSD-123/haptic-feedback?token=secret&utm_source=test#details',
    );

    expect(text).toContain('linear.app');
    expect(text).toContain('linear');
    expect(text).toContain('SSD-123');
    expect(text).toContain('haptic-feedback');
    expect(text).not.toContain('secret');
    expect(text).not.toContain('utm_source');
    expect(text).not.toContain('details');
  });

  it('ignores non-url storage keys', () => {
    expect(getSearchableTextFromUrl('attachments/private/abc-123-image.png')).toBe('');
  });
});

describe('getSearchableTextFromBlock', () => {
  it('includes inline link href metadata and visible text', () => {
    const block = {
      type: 'paragraph',
      props: {},
      content: [
        { type: 'text', text: 'Spec', styles: {} },
        {
          type: 'link',
          href: 'https://example.com/docs/SSD-haptic-feedback',
          content: [{ type: 'text', text: 'reference', styles: {} }],
        },
      ],
      children: [],
    } as unknown as Block;

    const text = getSearchableTextFromBlock(block);

    expect(text).toContain('Spec');
    expect(text).toContain('reference');
    expect(text).toContain('example.com');
    expect(text).toContain('SSD-haptic-feedback');
  });

  it('indexes media names but skips non-url media storage keys', () => {
    const block = {
      type: 'file',
      props: { name: 'SSD haptic diagram.pdf', url: 'attachments/private/diagram.pdf' },
      content: undefined,
      children: [],
    } as unknown as Block;

    const text = getSearchableTextFromBlock(block);

    expect(text).toContain('SSD haptic diagram.pdf');
    expect(text).not.toContain('attachments/private');
  });
});

