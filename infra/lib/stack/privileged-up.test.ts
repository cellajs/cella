import { describe, expect, it } from 'vitest';
import { isPrivilegedUp, PRIVILEGED_UP_ENV, vmPolicyIgnoreChanges } from './privileged-up';

describe('privileged-up', () => {
  it('is off unless the marker is exactly "1"', () => {
    expect(isPrivilegedUp({})).toBe(false);
    expect(isPrivilegedUp({ [PRIVILEGED_UP_ENV]: 'true' })).toBe(false);
    expect(isPrivilegedUp({ [PRIVILEGED_UP_ENV]: '1' })).toBe(true);
  });

  it('CI ups ignore policy rules; privileged ups reconcile them', () => {
    expect(vmPolicyIgnoreChanges({})).toEqual(['rules', 'description']);
    expect(vmPolicyIgnoreChanges({ [PRIVILEGED_UP_ENV]: '1' })).toEqual(['description']);
  });
});
