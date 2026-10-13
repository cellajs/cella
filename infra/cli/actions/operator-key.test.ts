import { describe, expect, it } from 'vitest';
import { acceptanceVerdict } from './operator-key';

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
