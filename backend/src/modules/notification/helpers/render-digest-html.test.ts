import { describe, expect, it } from 'vitest';
import { type DigestSection, htmlToExcerpt, renderSectionsHtml } from './render-digest-html';

describe('htmlToExcerpt', () => {
  it('strips markup and collapses whitespace', () => {
    expect(htmlToExcerpt('<p>Hello   <strong>there</strong></p>', 100)).toBe('Hello there');
  });

  it('decodes the entities a stored body commonly carries', () => {
    expect(htmlToExcerpt('<p>a &amp; b &lt; c</p>', 100)).toBe('a & b < c');
  });

  // Plain text for a param Brevo escapes once; tests/emails/brevo-send.test.ts checks the mail as filled.
  it('returns escaped markup in the body as the text it spells', () => {
    expect(htmlToExcerpt('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>', 100)).toBe('<script>alert(1)</script>');
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

const section: DigestSection = { channelId: 'c1', channelName: 'Ontwerp', lines: ['Nieuwe reactie op <strong>Roadmap</strong>'], overflow: 3 };

describe('renderSectionsHtml', () => {
  // The committed locale bundles, so a language missing the line fails here.
  it("writes the overflow line in the recipient's language", () => {
    expect(renderSectionsHtml([section], 'nl')).toBe('<h3>Ontwerp</h3><ul><li>Nieuwe reactie op <strong>Roadmap</strong></li><li>en nog 3</li></ul>');
    expect(renderSectionsHtml([section], 'en')).toContain('<li>and 3 more</li>');
  });

  it('leaves the overflow line out when every row is quoted', () => {
    expect(renderSectionsHtml([{ ...section, overflow: 0 }], 'en')).toBe(
      '<h3>Ontwerp</h3><ul><li>Nieuwe reactie op <strong>Roadmap</strong></li></ul>',
    );
  });
});
