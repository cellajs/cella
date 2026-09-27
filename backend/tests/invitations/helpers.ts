import { type EntityRole, hierarchy } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import { baseDb as db } from '#/db/db';
import { mockPastIsoDate } from '#/mocks';
import { tokenPolicies } from '#/modules/auth/tokens/token-policies';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { createDate } from '#/utils/time-span';
import { authCookie, insertTestToken } from '../helpers';

interface CreateInvitationOpts {
  organization: { id: string; tenantId: string };
  email: string;
  createdBy: string;
  role?: EntityRole;
  /** Bind the invitation and its token to a user. Omitted = the shape sent to an address without an account. */
  boundTo?: string | null;
  /** `fresh` = the emailed link is unopened; `invoked` = it was opened and the browser holds the single-use cookie. */
  token?: 'fresh' | 'invoked';
}

/** One membership invitation with its token, in the state a test needs. */
export async function createInvitation({
  organization,
  email,
  createdBy,
  role = hierarchy.getLeastPrivilegedRole('organization'),
  boundTo = null,
  token: tokenState = 'fresh',
}: CreateInvitationOpts) {
  const inactiveMembershipId = generateId();
  const tokenId = generateId();
  const rawSingleUseToken = nanoid(40);

  const [inactiveMembership] = await db
    .insert(inactiveMembershipsTable)
    .values({
      id: inactiveMembershipId,
      email,
      userId: boundTo,
      tokenId,
      channelId: organization.id,
      organizationId: organization.id,
      tenantId: organization.tenantId,
      channelType: 'organization' as const,
      role,
      createdBy,
      createdAt: mockPastIsoDate(),
    })
    .returning();

  const { raw: rawToken, row: token } = await insertTestToken(
    'invitation',
    { id: boundTo, email },
    {
      id: tokenId,
      createdBy,
      inactiveMembershipId,
      createdAt: mockPastIsoDate(),
      // Opening the link swaps the week-long lifetime for the single-use window.
      ...(tokenState === 'invoked'
        ? { openedWith: rawSingleUseToken, expiresAt: createDate(tokenPolicies.invitation.singleUseWindow) }
        : { expiresInMs: 7 * 24 * 60 * 60 * 1000 }),
    },
  );

  /** Cookie header value for the single-use token; only meaningful for an invoked token. */
  const invitationCookie = authCookie('invitation', rawSingleUseToken);

  return { inactiveMembership, token, rawToken, rawSingleUseToken, invitationCookie };
}
