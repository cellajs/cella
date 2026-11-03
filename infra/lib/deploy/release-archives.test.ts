import { describe, expect, it } from 'vitest';
import { appServices } from '../../config/services.config';
import { imageRepositoryOf } from './release-archives';

describe('imageRepositoryOf', () => {
  it('names the archive of every service image, a reused one included', () => {
    expect(imageRepositoryOf('${REGISTRY}/backend:${JOBS_TAG:-latest}')).toBe('backend');
    expect(imageRepositoryOf('${REGISTRY}/cdc:${CDC_TAG}')).toBe('cdc');
    for (const [slug, service] of Object.entries(appServices)) expect(imageRepositoryOf(service.image), slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('refuses an image no archive of the release holds', () => {
    expect(() => imageRepositoryOf('docker.io/library/redis:7')).toThrow(/no archive of the release holds it/);
  });
});
