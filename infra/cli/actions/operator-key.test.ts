import { describe, expect, it } from 'vitest';
import { acceptanceVerdict, operatorReach } from './operator-key';

describe('operatorReach', () => {
  it('reaches the environment the action runs for, then every other one that has a project', () => {
    expect(operatorReach('staging', 'p-staging', new Map([['p-production', 'production']]))).toEqual([
      { mode: 'staging', projectId: 'p-staging' },
      { mode: 'production', projectId: 'p-production' },
    ]);
  });

  it('is one environment when no other has a project on this machine', () => {
    expect(operatorReach('production', 'p-production', new Map())).toEqual([{ mode: 'production', projectId: 'p-production' }]);
  });

  it('names a shared project once', () => {
    expect(operatorReach('staging', 'p-one', new Map([['p-one', 'production']]))).toEqual([{ mode: 'staging', projectId: 'p-one' }]);
  });
});

describe('acceptanceVerdict', () => {
  it('reports the key as accepted only when this address is in the list, or unknown, and Scaleway took it', () => {
    expect(acceptanceVerdict({ addressInList: true, accepted: true })).toBe('accepted');
    expect(acceptanceVerdict({ addressInList: undefined, accepted: true })).toBe('accepted');
  });

  it('says not yet when an address in the list is still refused: a new policy takes minutes to hold everywhere', () => {
    expect(acceptanceVerdict({ addressInList: true, accepted: false })).toBe('not-yet');
    expect(acceptanceVerdict({ addressInList: undefined, accepted: false })).toBe('not-yet');
  });

  it('must not call a refusal a fault from an address outside the list: Scaleway refuses the key there by design', () => {
    expect(acceptanceVerdict({ addressInList: false, accepted: false })).toBe('cannot-check');
  });
});
