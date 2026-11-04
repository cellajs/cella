import { describe, expect, it } from 'vitest';
import { appPrincipalNames, principalNames } from './principals';

describe('principal names', () => {
  it('names one operator, one operators group and one observer for every environment of the app', () => {
    expect(appPrincipalNames('cella')).toEqual({ operator: 'cella-operator', operators: 'cella-operators', observer: 'cella-observer' });
  });

  it('keeps every other principal to its own environment', () => {
    const production = principalNames('cella', 'production');
    const staging = principalNames('cella-staging', 'staging');
    for (const name of ['group', 'ciDeploy', 'admin', 'uploads'] as const) expect(production[name]).not.toBe(staging[name]);
  });
});
