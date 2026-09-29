import { describe, expect, it } from 'vitest';
import { appConfig } from '../config-builder/app-config.ts';
import { isOrganizationKey, type MediaRefContext, parseMediaRef } from './media-ref.ts';

const organizationId = '0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b';
const otherOrganizationId = '0199a1b2-c3d4-7e5f-8a6b-000000000000';
const ctx = { organizationId };
const cdn = appConfig.s3.publicCDNUrl;
const ownKey = `${organizationId}/0199a1b2-c3d4-7e5f-8a6b-111111111111/photo.webp`;
const foreignKey = `${otherOrganizationId}/0199a1b2-c3d4-7e5f-8a6b-222222222222/contract.png`;
const hash = 'a'.repeat(64);

const kindOf = (ref: string, context: MediaRefContext = ctx) => parseMediaRef(ref, context).kind;

/** Runs `fn` with the asset origin configured, as it is once an asset service exists. */
const withAssetOrigin = (origin: string, fn: () => void) => {
  const configured = appConfig.mediaAssetOrigin;
  appConfig.mediaAssetOrigin = origin;
  try {
    fn();
  } finally {
    appConfig.mediaAssetOrigin = configured;
  }
};

describe('parseMediaRef', () => {
  it('accepts an attachment id and a key under the own organization (positive control)', () => {
    const attachmentId = '0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c';
    expect(parseMediaRef(attachmentId, ctx)).toEqual({ kind: 'attachment', id: attachmentId });
    expect(parseMediaRef(attachmentId.toUpperCase(), ctx).kind).toBe('attachment');
    expect(parseMediaRef(ownKey, ctx)).toEqual({ kind: 'orgKey', key: ownKey });
    // Transloadit reports stored paths with a leading slash.
    expect(parseMediaRef(`/${ownKey}`, ctx)).toEqual({ kind: 'orgKey', key: `/${ownKey}` });
  });

  it('must not load from another host via a URL that starts like the CDN', () => {
    expect(kindOf(`${cdn}@evil.example/pixel.png`)).toBe('invalid');
    expect(kindOf(`${cdn}.evil.example/pixel.png`)).toBe('invalid');
    expect(kindOf(`${cdn}:8443/pixel.png`)).toBe('invalid');
  });

  it('must not load from another host via a relative-looking reference', () => {
    expect(kindOf('//evil.example/pixel.png')).toBe('invalid');
    expect(kindOf('\\\\evil.example\\pixel.png')).toBe('invalid');
    expect(kindOf('/\\evil.example/pixel.png')).toBe('invalid');
    expect(kindOf(`//${organizationId}/pixel.png`)).toBe('invalid');
  });

  it('must not load any absolute URL, the app CDN and the former allowlist included', () => {
    for (const url of [
      'https://i.imgur.com/abc123.png',
      'https://www.youtube.com/watch?v=abc123',
      `${cdn}/${ownKey}`,
      `https://${appConfig.s3.publicBucket}.${appConfig.s3.host}/${ownKey}`,
      'http://evil.example/pixel.png',
      'javascript:alert(1)',
      'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
      'blob:https://evil.example/0199a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c',
    ]) {
      expect(kindOf(url), url).toBe('invalid');
    }
  });

  it("must not read another organization's object via its key", () => {
    expect(kindOf(foreignKey)).toBe('invalid');
    expect(kindOf(`/${foreignKey}`)).toBe('invalid');
    // A prefix shared by two ids is not the organization's prefix.
    expect(kindOf(`${organizationId}-x/file.png`)).toBe('invalid');
    expect(kindOf(`${organizationId}file.png`)).toBe('invalid');
  });

  it('must not climb out of the own prefix via dot segments, encoded separators or dropped characters', () => {
    for (const ref of [
      `${organizationId}/../${foreignKey}`,
      `${organizationId}/./../${foreignKey}`,
      `${organizationId}/%2e%2e/${foreignKey}`,
      `${organizationId}/%2E./${foreignKey}`,
      `${organizationId}/..%2f..%2f${foreignKey}`,
      `${organizationId}/..%2F${foreignKey}`,
      `${organizationId}/..%5c..%5c${foreignKey}`,
      `${organizationId}/..\\..\\${foreignKey}`,
      `${organizationId}/.\t./${foreignKey}`,
      `${organizationId}/.\n./${foreignKey}`,
    ]) {
      expect(kindOf(ref), JSON.stringify(ref)).toBe('invalid');
    }
  });

  it('must not trust a key without the document organization', () => {
    expect(kindOf(ownKey, { organizationId: undefined })).toBe('invalid');
    expect(kindOf(ownKey, { organizationId: null })).toBe('invalid');
    expect(kindOf(`/${ownKey}`, { organizationId: '' })).toBe('invalid');
  });

  it('refuses empty and shapeless input', () => {
    for (const ref of ['', ' ', 'image.png', 'attachment-key-123', `${organizationId} `, `x${ownKey}`]) {
      expect(kindOf(ref), JSON.stringify(ref)).toBe('invalid');
    }
  });

  it('accepts no asset while no asset origin is configured', () => {
    expect(appConfig.mediaAssetOrigin).toBe('');
    expect(kindOf(`https://assets.example.test/${hash}.webp`)).toBe('invalid');
  });

  it('accepts an asset on the exact configured origin in canonical content-hash form (positive control)', () => {
    withAssetOrigin('https://assets.example.test', () => {
      const url = `https://assets.example.test/${hash}.webp`;
      expect(parseMediaRef(url, ctx)).toEqual({ kind: 'asset', url });
      expect(kindOf(`https://assets.example.test/${hash}.png`)).toBe('asset');
    });
  });

  it('must not load from another host via an asset-shaped URL', () => {
    withAssetOrigin('https://assets.example.test', () => {
      for (const url of [
        `https://assets.example.test@evil.example/${hash}.webp`,
        `https://assets.example.test.evil.example/${hash}.webp`,
        `https://assets.example.test:8443/${hash}.webp`,
        `http://assets.example.test/${hash}.webp`,
        `https://user@assets.example.test/${hash}.webp`,
        `//assets.example.test/${hash}.webp`,
      ]) {
        expect(kindOf(url), url).toBe('invalid');
      }
    });
  });

  it('must not pass another object on the asset origin via a path outside the content-hash shape', () => {
    withAssetOrigin('https://assets.example.test', () => {
      for (const url of [
        'https://assets.example.test/avatar.png',
        `https://assets.example.test/${hash}.svg`,
        `https://assets.example.test/${hash}.html`,
        `https://assets.example.test/${hash.toUpperCase()}.webp`,
        `https://assets.example.test/other/${hash}.webp`,
        `https://assets.example.test/other/../${hash}.webp`,
        `https://assets.example.test/${hash}.webp?download=1`,
        `https://assets.example.test/${hash}.webp#x`,
        `https://ASSETS.example.test/${hash}.webp`,
      ]) {
        expect(kindOf(url), url).toBe('invalid');
      }
    });
  });
});

describe('isOrganizationKey', () => {
  it('accepts keys under the prefix, with or without a leading slash (positive control)', () => {
    expect(isOrganizationKey(ownKey, organizationId)).toBe(true);
    expect(isOrganizationKey(`/${ownKey}`, organizationId)).toBe(true);
  });

  it('must not accept a key outside the prefix via an empty organization id', () => {
    expect(isOrganizationKey('/evil.example/x.png', '')).toBe(false);
    expect(isOrganizationKey('//evil.example/x.png', '')).toBe(false);
  });
});
