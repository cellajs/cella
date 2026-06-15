import type { EntityRole } from 'shared';
import { generateId } from 'shared/entity-id';
import { nanoid } from 'shared/nanoid';
import { baseDb as db } from '#/db/db';
import { mockPastIsoDate } from '#/mocks';
import { tokensTable } from '#/modules/auth/tokens-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import type { UserModel } from '#/modules/user/user-db';

/**
 * Create a membership invitation token for a user to join an organization
 */
export async function createMembershipInvitationToken(
  user: UserModel,
  organizationId: string,
  role: EntityRole,
  tenantId: string,
) {
  // Create inactive membership first
  const inactiveMembership = {
    id: generateId(),
    userId: user.id,
    email: user.email,
    contextId: organizationId,
    organizationId,
    tenantId,
    contextType: 'organization' as const,
    role,
    createdAt: mockPastIsoDate(),
    createdBy: user.id,
  };

  const [insertedInactiveMembership] = await db.insert(inactiveMembershipsTable).values(inactiveMembership).returning();

  // Create token linked to inactive membership
  const tokenRecord = {
    id: generateId(),
    secret: nanoid(),
    type: 'invitation' as const,
    email: user.email,
    userId: user.id,
    inactiveMembershipId: insertedInactiveMembership.id,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    createdAt: mockPastIsoDate(),
  };

  await db.insert(tokensTable).values(tokenRecord);
  return { token: tokenRecord, inactiveMembership: insertedInactiveMembership };
}
