import { describe, expect, it } from 'vitest';
import { trustedMediaDomains, validateBlockMediaUrls } from '#/utils/validate-block-urls';

// Helper to create a minimal BlockNote block JSON string
const makeBlocks = (...blocks: Record<string, unknown>[]) => JSON.stringify(blocks);

const cdnImage = (url: string) => ({
  id: '1',
  type: 'image',
  props: { url, caption: '', width: 512 },
  content: [],
  children: [],
});

const cdnVideo = (url: string) => ({
  id: '2',
  type: 'video',
  props: { url, caption: '' },
  content: [],
  children: [],
});

const paragraph = (text: string) => ({
  id: '3',
  type: 'paragraph',
  props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
  content: [{ type: 'text', text, styles: {} }],
  children: [],
});

const linkParagraph = (href: string) => ({
  id: '4',
  type: 'paragraph',
  props: { textColor: 'default', backgroundColor: 'default', textAlignment: 'left' },
  content: [{ type: 'link', content: 'click here', href }],
  children: [],
});

const nestedBlock = (parentType: string, child: Record<string, unknown>) => ({
  id: '5',
  type: parentType,
  props: { textColor: 'default' },
  content: [],
  children: [child],
});

describe('validateBlockMediaUrls', () => {
  describe('valid cases', () => {
    it('should pass blocks with no URLs', () => {
      const result = validateBlockMediaUrls(makeBlocks(paragraph('Hello world')));
      expect(result).toEqual({ valid: true });
    });

    it('should pass empty blocks array', () => {
      const result = validateBlockMediaUrls('[]');
      expect(result).toEqual({ valid: true });
    });

    it('should pass blocks with CDN image URLs', () => {
      const result = validateBlockMediaUrls(makeBlocks(cdnImage('https://imado-dev.s3.nl-ams.scw.cloud/my-image.png')));
      expect(result).toEqual({ valid: true });
    });

    it('should pass blocks with private CDN URLs', () => {
      const result = validateBlockMediaUrls(
        makeBlocks(cdnImage('https://imado-dev-priv.s3.nl-ams.scw.cloud/signed/image.jpg')),
      );
      expect(result).toEqual({ valid: true });
    });

    it('should pass blocks with extra allowed domains', () => {
      const result = validateBlockMediaUrls(makeBlocks(cdnImage('https://mycompany.com/photo.png')), ['mycompany.com']);
      expect(result).toEqual({ valid: true });
    });

    it('should pass YouTube URLs from the default allowlist', () => {
      const result = validateBlockMediaUrls(makeBlocks(cdnVideo('https://www.youtube.com/watch?v=abc123')));
      expect(result).toEqual({ valid: true });
    });

    it('should pass Vimeo URLs from the default allowlist', () => {
      const result = validateBlockMediaUrls(makeBlocks(cdnVideo('https://player.vimeo.com/video/12345')));
      expect(result).toEqual({ valid: true });
    });

    it('should pass Imgur image URLs from the default allowlist', () => {
      const result = validateBlockMediaUrls(makeBlocks(cdnImage('https://i.imgur.com/abc123.png')));
      expect(result).toEqual({ valid: true });
    });

    it('should pass subdomain URLs of trusted domains', () => {
      const result = validateBlockMediaUrls(makeBlocks(cdnImage('https://lh3.googleusercontent.com/photo.jpg')));
      expect(result).toEqual({ valid: true });
    });

    it('should ignore inline links (href) — only media blocks are checked', () => {
      const result = validateBlockMediaUrls(makeBlocks(linkParagraph('https://evil.com/phishing')));
      expect(result).toEqual({ valid: true });
    });

    it('should pass media blocks with empty URL', () => {
      const result = validateBlockMediaUrls(
        makeBlocks({ id: '1', type: 'image', props: { url: '' }, content: [], children: [] }),
      );
      expect(result).toEqual({ valid: true });
    });
  });

  describe('invalid cases', () => {
    it('should reject untrusted external image URLs', () => {
      const result = validateBlockMediaUrls(makeBlocks(cdnImage('https://evil.com/tracking-pixel.png')));
      expect(result).toEqual({
        valid: false,
        invalidUrls: ['https://evil.com/tracking-pixel.png'],
      });
    });

    it('should reject inappropriate/untrusted domains', () => {
      const result = validateBlockMediaUrls(makeBlocks(cdnImage('https://untrusted-site.xxx/image.jpg')));
      expect(result).toEqual({
        valid: false,
        invalidUrls: ['https://untrusted-site.xxx/image.jpg'],
      });
    });

    it('should reject external video URLs', () => {
      const result = validateBlockMediaUrls(makeBlocks(cdnVideo('https://badsite.org/malware.mp4')));
      expect(result).toEqual({
        valid: false,
        invalidUrls: ['https://badsite.org/malware.mp4'],
      });
    });

    it('should collect multiple invalid URLs', () => {
      const result = validateBlockMediaUrls(
        makeBlocks(cdnImage('https://evil.com/img1.png'), cdnVideo('https://badsite.org/vid.mp4')),
      );
      expect(result).toEqual({
        valid: false,
        invalidUrls: ['https://evil.com/img1.png', 'https://badsite.org/vid.mp4'],
      });
    });

    it('should reject nested media blocks with invalid URLs', () => {
      const result = validateBlockMediaUrls(
        makeBlocks(nestedBlock('paragraph', cdnImage('https://external.io/sneaky.png'))),
      );
      expect(result).toEqual({
        valid: false,
        invalidUrls: ['https://external.io/sneaky.png'],
      });
    });

    it('should handle malformed JSON gracefully', () => {
      const result = validateBlockMediaUrls('not valid json {{{');
      expect(result).toEqual({
        valid: false,
        invalidUrls: ['[malformed JSON]'],
      });
    });

    it('should handle non-array JSON gracefully', () => {
      const result = validateBlockMediaUrls('{"type": "not-an-array"}');
      expect(result).toEqual({
        valid: false,
        invalidUrls: ['[invalid block structure]'],
      });
    });
  });

  describe('mixed cases', () => {
    it('should pass CDN URLs and reject external URLs in the same document', () => {
      const result = validateBlockMediaUrls(
        makeBlocks(
          cdnImage('https://imado-dev.s3.nl-ams.scw.cloud/ok.png'),
          cdnImage('https://evil.com/bad.png'),
          paragraph('Some text'),
        ),
      );
      expect(result).toEqual({
        valid: false,
        invalidUrls: ['https://evil.com/bad.png'],
      });
    });

    it('should pass with extra domains while rejecting unmatched URLs', () => {
      const result = validateBlockMediaUrls(
        makeBlocks(cdnImage('https://trusted.org/img.png'), cdnImage('https://untrusted.org/img.png')),
        ['trusted.org'],
      );
      expect(result).toEqual({
        valid: false,
        invalidUrls: ['https://untrusted.org/img.png'],
      });
    });
  });

  describe('trustedMediaDomains', () => {
    it('should export a non-empty default allowlist', () => {
      expect(trustedMediaDomains.length).toBeGreaterThan(0);
    });

    it('should include common video platforms', () => {
      expect(trustedMediaDomains).toContain('youtube.com');
      expect(trustedMediaDomains).toContain('vimeo.com');
    });

    it('should include common image hosts', () => {
      expect(trustedMediaDomains).toContain('imgur.com');
      expect(trustedMediaDomains).toContain('unsplash.com');
    });
  });
});
