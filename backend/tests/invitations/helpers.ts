import { type EntityRole, hierarchy } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import { baseDb as db } from '#/db/db';
import { mockPastIsoDate } from '#/mocks';
import { authCookieName } from '#/modules/auth/general/helpers/cookie';
import { tokensTable } from '#/modules/auth/tokens-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import type { UserModel } from '#/modules/user/user-db';
import { hashToken } from '#/utils/hash-token';

export async function createMembershipInvitationToken(
  user: UserModel,
  organizationId: string,
  role: EntityRole,
  tenantId: string,
) {
  const inactiveMembership = {
    id: generateId(),
    userId: user.id,
    email: user.email,
    channelId: organizationId,
    organizationId,
    tenantId,
    channelType: 'organization' as const,
    role,
    createdAt: mockPastIsoDate(),
    createdBy: user.id,
  };

  const [insertedInactiveMembership] = await db.insert(inactiveMembershipsTable).values(inactiveMembership).returning();

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

interface CreateInvokedInvitationTokenOpts {
  email: string;
  organization: { id: string; tenantId: string };
  createdBy: string;
  role?: EntityRole;
  /** Pre-bind the invitation to a user; omitted = the new-user shape (unbound, token-only). */
  userId?: string | null;
}

/**
 * An invitation for an address without an account, in the state right after its emailed link was opened:
 * unbound inactive membership, invoked token, and the single-use cookie the browser now holds.
 */
export async function createInvokedInvitationToken({
  email,
  organization,
  createdBy,
  role = hierarchy.getLeastPrivilegedRole('organization'),
  userId = null,
}: CreateInvokedInvitationTokenOpts) {
  const inactiveMembershipId = generateId();
  const tokenId = generateId();
  const rawSingleUseToken = nanoid(40);

  const [inactiveMembership] = await db
    .insert(inactiveMembershipsTable)
    .values({
      id: inactiveMembershipId,
      email,
      userId,
      tokenId,
      channelId: organization.id,
      organizationId: organization.id,
      tenantId: organization.tenantId,
      channelType: 'organization' as const,
      role,
      createdBy,
    })
    .returning();

  const [token] = await db
    .insert(tokensTable)
    .values({
      id: tokenId,
      secret: hashToken(nanoid(40)),
      singleUseToken: hashToken(rawSingleUseToken),
      type: 'invitation' as const,
      email,
      userId,
      createdBy,
      inactiveMembershipId,
      invokedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    .returning();

  const invitationCookie = `${authCookieName('invitation')}=${rawSingleUseToken}`;

  return { token, inactiveMembership, invitationCookie, rawSingleUseToken };
}
