import { db } from '#/db/db';
import { inactiveMembershipsTable } from '#/db/schema/inactive-memberships';
import { tokensTable } from '#/db/schema/tokens';
import type { UserModel } from '#/db/schema/users';
import { pastIsoDate } from '#/mocks/utils';
import { nanoid } from '#/utils/nanoid';

/**
 * Create a membership invitation token for a user to join an organization
 */
export async function createMembershipInvitationToken(
  user: UserModel,
  organizationId: string,
  role: 'admin' | 'member' = 'member',
) {
  // Create inactive membership first
  const inactiveMembership = {
    id: nanoid(),
    userId: user.id,
    email: user.email,
    organizationId,
    contextType: 'organization' as const,
    role,
    uniqueKey: `${user.id}-${organizationId}`,
    createdAt: pastIsoDate(),
    createdBy: user.id,
  };

  const [insertedInactiveMembership] = await db.insert(inactiveMembershipsTable).values(inactiveMembership).returning();

  // Create token linked to inactive membership
  const tokenRecord = {
    id: nanoid(),
    token: nanoid(),
    type: 'invitation' as const,
    email: user.email,
    userId: user.id,
    inactiveMembershipId: insertedInactiveMembership.id,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    createdAt: pastIsoDate(),
  };

  await db.insert(tokensTable).values(tokenRecord);
  return { token: tokenRecord, inactiveMembership: insertedInactiveMembership };
}
