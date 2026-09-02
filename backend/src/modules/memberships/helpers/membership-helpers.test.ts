import { hierarchy } from 'shared';
import { describe, expect, it } from 'vitest';
import { resolveAssociatedMembershipRole, resolveRootMembershipRole } from './membership-helpers';

// Derived from the hierarchy so the test holds for any app role registry.
const root = hierarchy.rootChannelType;
const leastPrivileged = hierarchy.getLeastPrivilegedRole(root);
const mostPrivileged = hierarchy.getMostPrivilegedRole(root);

describe('resolveAssociatedMembershipRole', () => {
  it("defaults to the vocabulary's least-privileged role", () => {
    expect(resolveAssociatedMembershipRole(root, mostPrivileged)).toBe(leastPrivileged);
  });

  it('carries the invited role over when carryRole is set and valid', () => {
    expect(resolveAssociatedMembershipRole(root, mostPrivileged, true)).toBe(mostPrivileged);
  });

  it('falls back to the least-privileged role for an invited role outside the vocabulary, even with carryRole', () => {
    expect(resolveAssociatedMembershipRole(root, 'not-a-role' as any, true)).toBe(leastPrivileged);
  });
});

describe('resolveRootMembershipRole', () => {
  // The root channel cannot declare rootRoles; mapping resolution against a declared map is
  // covered by the config-builder tests (entity-hierarchy.test.ts).
  it('throws for a channel without a rootRoles map: explicit escalation is required', () => {
    expect(() => resolveRootMembershipRole(root, mostPrivileged)).toThrow(/rootRoles/);
  });
});
