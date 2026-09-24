import { describe, expect, it } from 'vitest';
import { resolveOrganizationIdFromEnv, scwConfigPathNone } from './bootstrap-scw-env';

describe('scwConfigPathNone', () => {
  it('resolves relative to infraDir', () => {
    expect(scwConfigPathNone('/repo/infra')).toBe('/repo/infra/.scw-config-none');
  });
});

describe('resolveOrganizationIdFromEnv', () => {
  it('reads either variable name', () => {
    expect(resolveOrganizationIdFromEnv({ SCW_ORGANIZATION_ID: 'org-1' })).toBe('org-1');
    expect(resolveOrganizationIdFromEnv({ SCW_DEFAULT_ORGANIZATION_ID: 'org-1' })).toBe('org-1');
    expect(resolveOrganizationIdFromEnv({ SCW_ORGANIZATION_ID: ' org-1 ', SCW_DEFAULT_ORGANIZATION_ID: 'org-1' })).toBe(
      'org-1',
    );
  });

  it('is undefined when neither is set or both are blank', () => {
    expect(resolveOrganizationIdFromEnv({})).toBeUndefined();
    expect(
      resolveOrganizationIdFromEnv({ SCW_ORGANIZATION_ID: '', SCW_DEFAULT_ORGANIZATION_ID: '  ' }),
    ).toBeUndefined();
  });

  it('refuses two names that disagree, so an exported value cannot shadow backend/.env', () => {
    expect(() =>
      resolveOrganizationIdFromEnv({ SCW_ORGANIZATION_ID: 'org-1', SCW_DEFAULT_ORGANIZATION_ID: 'org-2' }),
    ).toThrow(/disagree/);
  });
});
