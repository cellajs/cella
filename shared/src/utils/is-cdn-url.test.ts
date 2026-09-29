import { describe, expect, it } from 'vitest';
import { appConfig } from '../config-builder/app-config.ts';
import { isCDNUrl } from './is-cdn-url.ts';

const publicCdn = appConfig.s3.publicCDNUrl;
const privateCdn = appConfig.s3.privateCDNUrl;

describe('isCDNUrl', () => {
  it('accepts files on the public and private CDN (positive control)', () => {
    expect(isCDNUrl(`${publicCdn}/avatars/a.png`)).toBe(true);
    expect(isCDNUrl(`${privateCdn}/org/file.pdf`)).toBe(true);
  });

  it('must not load an image from another host via a CDN-prefixed userinfo URL', () => {
    expect(isCDNUrl(`${publicCdn}@evil.example/pixel.png`)).toBe(false);
    expect(isCDNUrl(`${privateCdn}@evil.example/pixel.png`)).toBe(false);
  });

  it('must not load an image from another host via a CDN-prefixed hostname', () => {
    expect(isCDNUrl(`${publicCdn}.evil.example/pixel.png`)).toBe(false);
    expect(isCDNUrl(`${publicCdn}evil.example/pixel.png`)).toBe(false);
    expect(isCDNUrl(`${publicCdn}:8443/pixel.png`)).toBe(false);
  });

  it('refuses empty and non-https input', () => {
    expect(isCDNUrl(undefined)).toBe(false);
    expect(isCDNUrl('')).toBe(false);
    expect(isCDNUrl(publicCdn.replace(/^https:/, 'http:'))).toBe(false);
  });

  it('must not reach another bucket via a path-style CDN base', () => {
    const configured = appConfig.s3.publicCDNUrl;
    appConfig.s3.publicCDNUrl = 'https://storage.example.test/app-public';
    try {
      expect(isCDNUrl('https://storage.example.test/app-public/a.png')).toBe(true);
      expect(isCDNUrl('https://storage.example.test/other-bucket/a.png')).toBe(false);
      expect(isCDNUrl('https://storage.example.test/app-public-evil/a.png')).toBe(false);
      expect(isCDNUrl('https://storage.example.test/app-public/../other-bucket/a.png')).toBe(false);
    } finally {
      appConfig.s3.publicCDNUrl = configured;
    }
  });
});
