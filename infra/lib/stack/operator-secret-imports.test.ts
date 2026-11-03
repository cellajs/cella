import { describe, expect, it } from 'vitest';
import { operatorSecretImports } from './operator-secret-imports';

const definitions = [{ secretName: 'admin-email' }, { secretName: 'brevo-api-key' }];
const opts = { region: 'nl-ams' };

describe('operatorSecretImports', () => {
  it('adopts the containers a teardown kept in the runtime folder', () => {
    const listed = [
      { id: 'id-1', name: 'admin-email', path: '/runtime/' },
      { id: 'id-2', name: 'brevo-api-key', path: '/runtime' },
    ];
    expect(operatorSecretImports(listed, definitions, opts)).toBe('admin-email=nl-ams/id-1,brevo-api-key=nl-ams/id-2');
  });

  it('must not adopt a container of the same name at another path', () => {
    const listed = [
      { id: 'id-9', name: 'admin-email', path: '/backend/' },
      { id: 'id-4', name: 'brevo-api-key', path: '/shared/backend/jobs' },
    ];
    expect(operatorSecretImports(listed, definitions, opts)).toBe('');
  });
});
