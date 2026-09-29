import { appConfig } from 'shared';
import { describe, expect, it } from 'vitest';
import { validateBlockMediaUrls } from '#/utils/validate-block-urls';

const organizationId = '0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b';
const otherOrganizationId = '0199a1b2-c3d4-7e5f-8a6b-000000000000';
const ctx = { organizationId };
const ownKey = `${organizationId}/0199a1b2-c3d4-7e5f-8a6b-111111111111/image.webp`;
const attachmentId = '0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c';

const makeBlocks = (...blocks: Record<string, unknown>[]) => JSON.stringify(blocks);

const image = (url: unknown) => ({
  id: '1',
  type: 'image',
  props: { url, caption: '', width: 512 },
  content: [],
  children: [],
});

const video = (url: string) => ({
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
    it('passes blocks without media and an empty document', () => {
      expect(validateBlockMediaUrls(makeBlocks(paragraph('Hello world')), ctx)).toEqual({ valid: true });
      expect(validateBlockMediaUrls('[]', ctx)).toEqual({ valid: true });
    });

    it('passes an attachment id and a key under the own organization (positive control)', () => {
      const blocks = makeBlocks(image(attachmentId), image(ownKey), image(`/${ownKey}`), video(attachmentId));
      expect(validateBlockMediaUrls(blocks, ctx)).toEqual({ valid: true });
    });

    it('passes a media block that holds no file yet', () => {
      expect(validateBlockMediaUrls(makeBlocks(image('')), ctx)).toEqual({ valid: true });
      expect(validateBlockMediaUrls(makeBlocks({ id: '1', type: 'image', props: {}, children: [] }), ctx)).toEqual({
        valid: true,
      });
    });

    it('leaves inline links alone: only media blocks load their reference', () => {
      expect(validateBlockMediaUrls(makeBlocks(linkParagraph('https://evil.example/phishing')), ctx)).toEqual({
        valid: true,
      });
    });
  });

  describe('invalid cases', () => {
    it('must not load media from another host via a URL that starts like the CDN', () => {
      const cdn = appConfig.s3.publicCDNUrl;
      const bypasses = [`${cdn}@evil.example/pixel.png`, `${cdn}.evil.example/pixel.png`];
      expect(validateBlockMediaUrls(makeBlocks(...bypasses.map(image)), ctx)).toEqual({
        valid: false,
        invalidUrls: bypasses,
      });
    });

    it('must not load media from another host via a protocol-relative or backslash reference', () => {
      const bypasses = ['//evil.example/pixel.png', '\\\\evil.example\\pixel.png'];
      expect(validateBlockMediaUrls(makeBlocks(...bypasses.map(image)), ctx)).toEqual({
        valid: false,
        invalidUrls: bypasses,
      });
    });

    it('must not load media via any absolute URL, the former allowlist and the own CDN included', () => {
      const urls = [
        'https://www.youtube.com/watch?v=abc123',
        'https://i.imgur.com/abc123.png',
        `${appConfig.s3.publicCDNUrl}/${ownKey}`,
        'https://evil.example/tracking-pixel.png',
      ];
      expect(validateBlockMediaUrls(makeBlocks(...urls.map(image)), ctx)).toEqual({ valid: false, invalidUrls: urls });
    });

    it("must not read another organization's object via its key or a path out of the own prefix", () => {
      const foreignKey = `${otherOrganizationId}/user/contract.png`;
      const keys = [
        foreignKey,
        `${organizationId}/../${foreignKey}`,
        `${organizationId}/%2e%2e/${foreignKey}`,
        `${organizationId}/..%2f..%2f${foreignKey}`,
      ];
      expect(validateBlockMediaUrls(makeBlocks(...keys.map(image)), ctx)).toEqual({ valid: false, invalidUrls: keys });
    });

    it('must not trust a key checked without the document organization', () => {
      expect(validateBlockMediaUrls(makeBlocks(image(ownKey)), {})).toEqual({ valid: false, invalidUrls: [ownKey] });
    });

    it('must not pass a URL via a non-string reference a renderer would coerce', () => {
      const result = validateBlockMediaUrls(makeBlocks(image(['https://evil.example/pixel.png'])), ctx);
      expect(result).toEqual({ valid: false, invalidUrls: ['["https://evil.example/pixel.png"]'] });
    });

    it('refuses nested media blocks and reports every refused reference', () => {
      const result = validateBlockMediaUrls(
        makeBlocks(image(ownKey), nestedBlock('paragraph', image('https://external.example/sneaky.png')), video('x')),
        ctx,
      );
      expect(result).toEqual({ valid: false, invalidUrls: ['https://external.example/sneaky.png', 'x'] });
    });

    it('handles malformed and non-array JSON', () => {
      expect(validateBlockMediaUrls('not valid json {{{', ctx)).toEqual({
        valid: false,
        invalidUrls: ['[malformed JSON]'],
      });
      expect(validateBlockMediaUrls('{"type": "not-an-array"}', ctx)).toEqual({
        valid: false,
        invalidUrls: ['[invalid block structure]'],
      });
    });

    it('must not hide a media block under a node whose type is not a string', () => {
      const hidden = '//evil.example/pixel.png';
      for (const type of [123, null, ['image']]) {
        const blocks = makeBlocks({ id: '6', type, props: {}, children: [image(hidden)] });
        expect(validateBlockMediaUrls(blocks, ctx), JSON.stringify(type)).toEqual({
          valid: false,
          invalidUrls: [hidden],
        });
      }
      const untyped = makeBlocks({ id: '6', props: {}, children: [image(hidden)] });
      expect(validateBlockMediaUrls(untyped, ctx)).toEqual({ valid: false, invalidUrls: [hidden] });
    });

    it('must not store a media block whose props is not an object', () => {
      for (const props of ['https://evil.example/pixel.png', null, 1, ['https://evil.example/pixel.png']]) {
        const blocks = makeBlocks({ id: '7', type: 'image', props, content: [], children: [] });
        expect(validateBlockMediaUrls(blocks, ctx), JSON.stringify(props)).toEqual({
          valid: false,
          invalidUrls: ['[invalid props]'],
        });
      }
      const withoutProps = makeBlocks({ id: '8', type: 'video', content: [], children: [] });
      expect(validateBlockMediaUrls(withoutProps, ctx)).toEqual({ valid: false, invalidUrls: ['[invalid props]'] });
    });

    it('skips list items that are not blocks', () => {
      expect(validateBlockMediaUrls('[null, 1, "text", {"props": {"url": "//evil.example"}}]', ctx)).toEqual({
        valid: true,
      });
    });
  });
});
