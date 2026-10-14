import { describe, expect, it } from 'vitest';
import { appSlug, principalNames } from './principals';

describe('appSlug', () => {
  it("drops the mode an environment's slug ends with", () => {
    expect(appSlug('cella-staging', 'staging')).toBe('cella');
  });

  it('keeps a slug that does not end with its mode', () => {
    expect(appSlug('cella', 'production')).toBe('cella');
    expect(appSlug('staging-tools', 'staging')).toBe('staging-tools');
  });

  it('must not leave an empty name', () => {
    expect(appSlug('-staging', 'staging')).toBe('-staging');
  });
});

describe('principalNames', () => {
  it('names one operator for every environment of the app', () => {
    expect(principalNames('cella', 'production').operator).toBe('cella-operator');
    expect(principalNames('cella-staging', 'staging').operator).toBe('cella-operator');
  });

  it('keeps every other principal to its own environment', () => {
    const production = principalNames('cella', 'production');
    const staging = principalNames('cella-staging', 'staging');
    for (const name of ['group', 'ciDeploy', 'admin', 'boot'] as const) expect(production[name]).not.toBe(staging[name]);
    expect(production.vmService('backend')).not.toBe(staging.vmService('backend'));
  });
});
