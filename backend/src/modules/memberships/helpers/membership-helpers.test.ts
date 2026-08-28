import { describe, expect, it } from 'vitest';
import { resolveAssociatedMembershipRole, resolveRootMembershipRole } from './membership-helpers';

describe('resolveAssociatedMembershipRole', () => {
  it("defaults to the vocabulary's least-privileged role", () => {
    expect(resolveAssociatedMembershipRole('organization', 'admin')).toBe('member');
  });

  it('carries the invited role over when carryRole is set and valid', () => {
    expect(resolveAssociatedMembershipRole('organization', 'admin', true)).toBe('admin');
  });

  it('falls back to the least-privileged role for an invited role outside the vocabulary, even with carryRole', () => {
    expect(resolveAssociatedMembershipRole('organization', 'staff' as any, true)).toBe('member');
  });
});

describe('resolveRootMembershipRole', () => {
  // The app hierarchy has a single root channel, which cannot declare rootRoles; mapping resolution
  // against a declared map is covered by the config-builder tests (entity-hierarchy.test.ts).
  it('throws for a channel without a rootRoles map: explicit escalation is required', () => {
    expect(() => resolveRootMembershipRole('organization', 'admin')).toThrow(/rootRoles/);
  });
});
