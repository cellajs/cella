import { hierarchy } from 'shared';
import { describe, expect, it } from 'vitest';
import { resolveAssociatedMembershipRole, resolveOrganizationMembershipRole } from './membership-helpers';

// Derived from the hierarchy so the test holds for any app role registry.
const leastPrivileged = hierarchy.getLeastPrivilegedRole('organization');
const mostPrivileged = hierarchy.getMostPrivilegedRole('organization');

describe('resolveAssociatedMembershipRole', () => {
  it("defaults to the vocabulary's least-privileged role", () => {
    expect(resolveAssociatedMembershipRole('organization', mostPrivileged)).toBe(leastPrivileged);
  });

  it('carries the invited role over when carryRole is set and valid', () => {
    expect(resolveAssociatedMembershipRole('organization', mostPrivileged, true)).toBe(mostPrivileged);
  });

  it('falls back to the least-privileged role for an invited role outside the vocabulary, even with carryRole', () => {
    expect(resolveAssociatedMembershipRole('organization', 'not-a-role' as any, true)).toBe(leastPrivileged);
  });
});

describe('resolveOrganizationMembershipRole', () => {
  // The organization cannot declare organizationRoles; mapping resolution against a declared map is
  // covered by the config-builder tests (entity-hierarchy.test.ts).
  it('throws for a channel without an organizationRoles map: explicit escalation is required', () => {
    expect(() => resolveOrganizationMembershipRole('organization', mostPrivileged)).toThrow(/organizationRoles/);
  });
});
