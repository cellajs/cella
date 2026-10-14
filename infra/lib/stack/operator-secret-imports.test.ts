import { describe, expect, it } from 'vitest';
import { operatorSecretImports } from './operator-secret-imports';

const definitions = [
  { secretName: 'admin-email', services: ['backend'] },
  { secretName: 'brevo-api-key', services: ['backend', 'jobs'] },
];
const opts = { slug: 'app-staging', mode: 'staging', region: 'nl-ams' };

describe('operatorSecretImports', () => {
  it('adopts the containers a teardown kept, each at its own path', () => {
    const listed = [
      { id: 'id-1', name: 'admin-email', path: '/app-staging-staging/backend/' },
      { id: 'id-2', name: 'brevo-api-key', path: '/app-staging-staging/shared/backend/jobs' },
    ];
    expect(operatorSecretImports(listed, definitions, opts)).toBe('admin-email=nl-ams/id-1,brevo-api-key=nl-ams/id-2');
  });

  it('must not adopt a container of the same name at another path', () => {
    const listed = [{ id: 'id-9', name: 'admin-email', path: '/other-production/backend/' }];
    expect(operatorSecretImports(listed, definitions, opts)).toBe('');
  });
});
