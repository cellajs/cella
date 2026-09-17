import { describe, expect, it } from 'vitest';
import { resolveOrganizationIdFromEnv, scwConfigPathNone, stateKeyForPrivilegedRun } from './bootstrap-scw-env';

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

describe('stateKeyForPrivilegedRun', () => {
  it('an explicit SCW_STATE_* pair wins over the standing key', () => {
    expect(
      stateKeyForPrivilegedRun({
        SCW_STATE_ACCESS_KEY: 'state-ak',
        SCW_STATE_SECRET_KEY: 'state-sk',
        SCW_ACCESS_KEY: 'standing-ak',
        SCW_SECRET_KEY: 'standing-sk',
      }),
    ).toEqual({ stateAccessKey: 'state-ak', stateSecretKey: 'state-sk' });
  });

  it('falls back to the standing key from infra/.env.<mode>', () => {
    expect(stateKeyForPrivilegedRun({ SCW_ACCESS_KEY: 'standing-ak', SCW_SECRET_KEY: 'standing-sk' })).toEqual({
      stateAccessKey: 'standing-ak',
      stateSecretKey: 'standing-sk',
    });
  });

  it('is empty without either pair, so the bootstrap key serves both sides', () => {
    expect(stateKeyForPrivilegedRun({})).toEqual({});
    expect(stateKeyForPrivilegedRun({ SCW_ACCESS_KEY: 'only-ak' })).toEqual({});
  });

  it('still refuses a half-set explicit pair', () => {
    expect(() => stateKeyForPrivilegedRun({ SCW_STATE_ACCESS_KEY: 'state-ak' })).toThrow(/set together/);
  });
});
