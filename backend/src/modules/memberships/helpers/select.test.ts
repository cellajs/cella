import { describe, expect, it } from 'vitest';
import { mockMembershipBase } from '#/modules/memberships/memberships-mocks';
import { membershipAsSeenBy } from './select';

describe('membershipAsSeenBy', () => {
  const membership = { ...mockMembershipBase(), archived: true, muted: true, displayOrder: 42 };

  it("must not show another user's archive, mute and order via a membership response", () => {
    const seen = membershipAsSeenBy(membership, 'another-user-id');

    for (const field of ['archived', 'muted', 'displayOrder']) expect(seen).not.toHaveProperty(field);
    expect(seen).toMatchObject({ id: membership.id, userId: membership.userId, role: membership.role });
  });

  it("keeps the viewer's own archive, mute and order (positive control)", () => {
    expect(membershipAsSeenBy(membership, membership.userId)).toEqual(membership);
  });
});
