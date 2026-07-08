import { describe, expect, it } from 'vitest';
import { sanitizeBlockMediaUrls } from '#/modules/yjs/helpers/sanitize-block-media';

const image = (url: string) => ({ id: '1', type: 'image', props: { url, caption: '' }, content: [], children: [] });
const paragraph = () => ({ id: '2', type: 'paragraph', props: {}, content: [], children: [] });

describe('sanitizeBlockMediaUrls', () => {
  it('passes trusted content through unchanged', () => {
    // Non-URL values are internal attachment keys and always trusted.
    const description = JSON.stringify([paragraph(), image('attachment-key-123')]);
    const result = sanitizeBlockMediaUrls(description);

    expect(result.sanitized).toBe(false);
    expect(result.description).toBe(description);
  });

  it('blanks untrusted media URLs instead of rejecting', () => {
    const bad = 'https://evil.example.com/tracker.png';
    const description = JSON.stringify([paragraph(), image(bad)]);
    const result = sanitizeBlockMediaUrls(description);

    expect(result.sanitized).toBe(true);
    expect(result.invalidUrls).toContain(bad);
    const blocks = JSON.parse(result.description);
    expect(blocks[1].props.url).toBe('');
    // Sanitized output must itself pass validation (blank = trusted internal reference)
    expect(sanitizeBlockMediaUrls(result.description).sanitized).toBe(false);
  });

  it('sanitizes nested children', () => {
    const bad = 'https://evil.example.com/x.mp4';
    const description = JSON.stringify([
      { ...paragraph(), children: [{ id: '3', type: 'video', props: { url: bad }, content: [], children: [] }] },
    ]);
    const result = sanitizeBlockMediaUrls(description);

    expect(result.sanitized).toBe(true);
    expect(JSON.parse(result.description)[0].children[0].props.url).toBe('');
  });

  it('degrades malformed JSON to an empty document rather than wedging', () => {
    const result = sanitizeBlockMediaUrls('not json');

    expect(result.sanitized).toBe(true);
    expect(result.description).toBe('[]');
  });
});
