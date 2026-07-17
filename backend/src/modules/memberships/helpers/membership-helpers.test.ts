import { describe, expect, it } from 'vitest';
import { resolveParentMembershipRole } from './membership-helpers';

describe('resolveParentMembershipRole', () => {
  it("defaults to 'member' when the vocabulary has it (previous hardcoded behavior)", () => {
    expect(resolveParentMembershipRole('organization', 'admin')).toBe('member');
  });

  it('carries the invited role over when carryRole is set and valid', () => {
    expect(resolveParentMembershipRole('organization', 'admin', true)).toBe('admin');
  });

  it('ignores carryRole for the default path when the invited role equals member', () => {
    expect(resolveParentMembershipRole('organization', 'member', true)).toBe('member');
  });
});
