import { describe, expect, it } from 'vitest';
import { isSecretEnvKey, scrubSecretEnv } from './scrub-secret-env';

describe('isSecretEnvKey', () => {
  it('flags the deploy credential vars', () => {
    for (const key of [
      'SCW_ACCESS_KEY',
      'SCW_SECRET_KEY',
      'SCW_DEFAULT_PROJECT_ID',
      'PULUMI_CONFIG_PASSPHRASE',
      'GITHUB_TOKEN',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
    ]) {
      expect(isSecretEnvKey(key), key).toBe(true);
    }
  });

  it('leaves ordinary build vars alone', () => {
    for (const key of ['PATH', 'HOME', 'NODE_VERSION', 'APP_MODE', 'BACKEND_URL', 'FRONTEND_URL', 'CI', 'LANG']) {
      expect(isSecretEnvKey(key), key).toBe(false);
    }
  });
});

describe('scrubSecretEnv', () => {
  it('removes secret keys and keeps the rest, dropping undefined values', () => {
    const scrubbed = scrubSecretEnv({
      PATH: '/usr/bin',
      APP_MODE: 'production',
      SCW_SECRET_KEY: 'super-secret',
      PULUMI_CONFIG_PASSPHRASE: 'pp',
      GITHUB_TOKEN: 'ghs_x',
      EMPTY: undefined,
    });
    expect(scrubbed).toEqual({ PATH: '/usr/bin', APP_MODE: 'production' });
    expect(scrubbed).not.toHaveProperty('SCW_SECRET_KEY');
    expect(scrubbed).not.toHaveProperty('EMPTY');
  });
});
