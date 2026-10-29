import { describe, expect, it } from 'vitest';
import { operatorSecretImports } from './operator-secret-imports';

const definitions = [
  { secretName: 'admin-email', services: ['backend'] },
  { secretName: 'brevo-api-key', services: ['backend', 'jobs'] },
];
const opts = { region: 'nl-ams' };

describe('operatorSecretImports', () => {
  it('adopts the copies a teardown kept, each at its consumer folder', () => {
    const listed = [
      { id: 'id-1', name: 'admin-email', path: '/backend/' },
      { id: 'id-2', name: 'brevo-api-key', path: '/backend' },
      { id: 'id-3', name: 'brevo-api-key', path: '/jobs/' },
    ];
    expect(operatorSecretImports(listed, definitions, opts)).toBe(
      'admin-email@backend=nl-ams/id-1,brevo-api-key@backend=nl-ams/id-2,brevo-api-key@jobs=nl-ams/id-3',
    );
  });

  it('must not adopt a container left in a shared folder: the copy step moves its value', () => {
    const listed = [{ id: 'id-4', name: 'brevo-api-key', path: '/shared/backend/jobs' }];
    expect(operatorSecretImports(listed, definitions, opts)).toBe('');
  });

  it('must not adopt a container of the same name at another path', () => {
    const listed = [{ id: 'id-9', name: 'admin-email', path: '/app-production/backend/' }];
    expect(operatorSecretImports(listed, definitions, opts)).toBe('');
  });
});
