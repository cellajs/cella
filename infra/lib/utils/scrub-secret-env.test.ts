import { describe, expect, it } from 'vitest';
import { isSecretEnvKey } from './scrub-secret-env';

describe('isSecretEnvKey', () => {
  it('flags the deploy secret vars', () => {
    for (const key of [
      'SCW_ACCESS_KEY',
      'SCW_SECRET_KEY',
      'SCW_ADMIN_SECRET_KEY',
      'SCW_OWNER_SECRET_KEY',
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
