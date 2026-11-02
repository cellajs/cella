import { describe, expect, it } from 'vitest';
import { frontendBuildEnv, parseServiceUrls } from './frontend-build-env';

describe('frontendBuildEnv', () => {
  it('emits APP_MODE and the config-loader origin override from enabled services JSON', () => {
    const raw = JSON.stringify([
      { service: 'backend', public_url: 'https://app.example/api' },
      { service: 'frontend', public_url: 'https://app.example' },
      { service: 'cdc', public_url: '' },
    ]);
    expect(frontendBuildEnv('staging', raw)).toEqual({ APP_MODE: 'staging', APP_ORIGIN: 'https://app.example' });
  });

  it('throws when the frontend public URL is absent', () => {
    expect(() => frontendBuildEnv('production', JSON.stringify([{ service: 'backend', public_url: 'https://app.example/api' }]))).toThrow(/frontend/);
  });
});

describe('parseServiceUrls', () => {
  it('rejects malformed rows', () => {
    expect(() => parseServiceUrls(JSON.stringify([{ service: 'backend' }]))).toThrow(/public_url/);
  });
});
