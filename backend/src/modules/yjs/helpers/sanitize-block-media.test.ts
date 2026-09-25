import { appConfig } from 'shared';
import { describe, expect, it } from 'vitest';
import { sanitizeBlockMediaUrls } from '#/modules/yjs/helpers/sanitize-block-media';

const organizationId = '0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b';
const ctx = { organizationId };
const ownKey = `${organizationId}/0199a1b2-c3d4-7e5f-8a6b-111111111111/image.webp`;
const attachmentId = '0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c';

const image = (url: string) => ({ id: '1', type: 'image', props: { url, caption: '' }, content: [], children: [] });
const paragraph = () => ({ id: '2', type: 'paragraph', props: {}, content: [], children: [] });

describe('sanitizeBlockMediaUrls', () => {
  it('passes an attachment id and an own-organization key through unchanged (positive control)', () => {
    const description = JSON.stringify([paragraph(), image(attachmentId), image(ownKey)]);
    const result = sanitizeBlockMediaUrls(description, ctx);

    expect(result.sanitized).toBe(false);
    expect(result.description).toBe(description);
  });

  it('must not persist media from outside the organization via a relay write', () => {
    const cdn = appConfig.s3.publicCDNUrl;
    const bypasses = [
      `${cdn}@evil.example/pixel.png`,
      `${cdn}.evil.example/pixel.png`,
      '//evil.example/pixel.png',
      '\\\\evil.example\\pixel.png',
      '0199a1b2-c3d4-7e5f-8a6b-000000000000/user/contract.png',
      `${organizationId}/../0199a1b2-c3d4-7e5f-8a6b-000000000000/user/contract.png`,
      `${organizationId}/..%2f..%2f0199a1b2-c3d4-7e5f-8a6b-000000000000/contract.png`,
      'https://i.imgur.com/abc123.png',
    ];
    const description = JSON.stringify([paragraph(), ...bypasses.map(image), image(ownKey)]);
    const result = sanitizeBlockMediaUrls(description, ctx);

    expect(result.sanitized).toBe(true);
    expect(result.invalidUrls).toEqual(bypasses);
    const urls = (JSON.parse(result.description) as { props: { url?: string } }[]).map((block) => block.props.url);
    expect(urls).toEqual([undefined, ...bypasses.map(() => ''), ownKey]);
    // The sanitized document passes on its own: a blank url holds no reference.
    expect(sanitizeBlockMediaUrls(result.description, ctx).sanitized).toBe(false);
  });

  it('sanitizes nested children', () => {
    const bad = 'https://evil.example/x.mp4';
    const description = JSON.stringify([
      { ...paragraph(), children: [{ id: '3', type: 'video', props: { url: bad }, content: [], children: [] }] },
    ]);
    const result = sanitizeBlockMediaUrls(description, ctx);

    expect(result.sanitized).toBe(true);
    expect(JSON.parse(result.description)[0].children[0].props.url).toBe('');
  });

  it('degrades content that is not a block list to an empty document', () => {
    for (const content of ['not json', '{"type": "image"}']) {
      const result = sanitizeBlockMediaUrls(content, ctx);
      expect(result.sanitized).toBe(true);
      expect(result.description).toBe('[]');
    }
  });
});
