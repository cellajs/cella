import { describe, expect, it } from 'vitest';
import { resolveParentMembershipRole } from './membership-helpers';

/**
 * Auto-created parent/associated membership roles (multi-vocabulary support): the
 * least-privileged fitting role by default — 'member' when the vocabulary has it,
 * identical to the previous hardcoded behavior — or the invited role carried over
 * when carryRole is set and valid. Multi-vocabulary branches (no 'member' in the
 * vocabulary, invalid carried roles) are exercised end-to-end by forks with nested
 * contexts; cella's single vocabulary covers the default paths here.
 */
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
