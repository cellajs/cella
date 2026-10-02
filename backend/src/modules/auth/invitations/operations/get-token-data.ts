import type { z } from '@hono/zod-openapi';
import type { DbContext } from '#/core/context';
import type { tokenWithDataSchema } from '#/modules/auth/general/general-schema';
import { isFederationConfigured, isFederationKey } from '#/modules/auth/sso/helpers/federations';
import { bindTokenToUser, type TokenRecord } from '#/modules/auth/tokens/tokens-queries';
import { findSsoConnectionByTenant } from '#/modules/connections/connections-queries';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { bindInactiveMemberships, findInactiveMembershipById } from '#/modules/memberships/memberships-queries';
import { findUserByEmail, findUserById } from '#/modules/user/user-queries';

type TokenData = z.infer<typeof tokenWithDataSchema>;

/** What a validated single-use token stands for. A membership invitation also says what it grants, for the confirm step. */
export async function getTokenDataOp(ctx: DbContext, tokenRecord: TokenRecord): Promise<TokenData> {
  const tokenData: TokenData = {
    email: tokenRecord.email,
    userId: tokenRecord.userId || '',
    inactiveMembershipId: tokenRecord.inactiveMembershipId || '',
  };

  if (!tokenRecord.inactiveMembershipId) return tokenData;

  const inactiveMembership = await findInactiveMembershipById(ctx, { id: tokenRecord.inactiveMembershipId });
  if (inactiveMembership) {
    const [entity, inviter, connection] = await Promise.all([
      resolveEntity(ctx, { entityType: inactiveMembership.channelType, identifier: inactiveMembership.channelId }),
      findUserById(ctx, { id: inactiveMembership.createdBy }),
      findSsoConnectionByTenant(ctx, { tenantId: inactiveMembership.tenantId }),
    ]);
    // The invited organization's institution, so the invitee is offered that sign-in first.
    if (connection?.status === 'active' && isFederationKey(connection.issuer) && isFederationConfigured(connection.issuer)) {
      tokenData.ssoConnectionId = connection.id;
    }
    if (entity) {
      tokenData.invitation = {
        entityType: inactiveMembership.channelType,
        entityName: entity.name,
        role: inactiveMembership.role,
        inviterName: inviter?.name ?? '',
      };
    }
  }

  if (tokenRecord.userId) return tokenData;

  // An account may have taken this address since the invite was sent; every account's address is a proven inbox.
  const existingUser = await findUserByEmail(ctx, { email: tokenRecord.email });
  if (existingUser) {
    await bindTokenToUser(ctx, { tokenId: tokenRecord.id, userId: existingUser.id });
    // Bind the invitation too, so it shows up in-app once they sign in; the token stays for this flow's cookie.
    await bindInactiveMemberships(ctx, { ids: [tokenRecord.inactiveMembershipId], userId: existingUser.id });
    tokenData.userId = existingUser.id;
  }

  return tokenData;
}
