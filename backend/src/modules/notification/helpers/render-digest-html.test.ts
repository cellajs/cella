import { describe, expect, it } from 'vitest';
import { htmlToExcerpt } from './render-digest-html';

describe('htmlToExcerpt', () => {
  it('strips markup and collapses whitespace', () => {
    expect(htmlToExcerpt('<p>Hello   <strong>there</strong></p>', 100)).toBe('Hello there');
  });

  it('decodes the entities a stored body commonly carries', () => {
    expect(htmlToExcerpt('<p>a &amp; b &lt; c</p>', 100)).toBe('a &amp; b &lt; c');
  });

  it('escapes the result, so body text can never inject markup into the email', () => {
    expect(htmlToExcerpt('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>', 100)).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('truncates on a word boundary and marks the cut', () => {
    const excerpt = htmlToExcerpt('one two three four five six seven eight', 20);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(21);
    expect(excerpt).not.toContain('eight');
  });

  it('leaves a short body untouched', () => {
    expect(htmlToExcerpt('short', 100)).toBe('short');
  });
});
