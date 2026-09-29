import type { Context } from 'hono';
import { errors, jwtVerify } from 'jose';
import { type AccessScope, accessScopes, appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { getPublicJwkSet } from '#/modules/oauth-server/keystore';
import type { IssuedTokenClaims } from '#/modules/oauth-server/provider';
import { resourceUri } from '#/modules/oauth-server/resources';

interface VerifiedToken {
  actorId: string;
  tenantId: string;
  /** The token's scope set, always a mask: a delegated token never carries an actor's full bindings implicitly. */
  scopes: AccessScope[];
  clientId: string;
}

/** A person's token names the grant it was issued under, a service account's the API key it was minted with. */
export type VerifiedAccessToken =
  | (VerifiedToken & { kind: 'user'; grantId: string })
  | (VerifiedToken & { kind: 'service'; keyId: string });

/** A bearer value that is a JWT (three segments); this app's opaque keys carry no dots. */
export function bearerJwtFrom(ctx: Context<Env>): string | null {
  const bearer = ctx.req.header('authorization');
  if (!bearer?.toLowerCase().startsWith('bearer ')) return null;
  const value = bearer.slice(7).trim();
  return value.split('.').length === 3 ? value : null;
}

/**
 * Verifies an access token this server issued, locally against the keystore (no self-HTTP, no DB row per token) and binds it
 * to the route's tenant and organization: the audience must be one of this route's resources (RFC 8707). The token
 * must name the grant or API key it rests on, which the guard then puts to the grant policy.
 */
export async function verifyAccessToken(
  jwt: string,
  route: { tenantId: string; organizationId?: string },
): Promise<VerifiedAccessToken> {
  const audiences = [resourceUri({ face: 'api', tenantId: route.tenantId })];
  if (route.organizationId)
    audiences.push(resourceUri({ face: 'mcp', tenantId: route.tenantId, organizationId: route.organizationId }));

  try {
    const { payload } = await jwtVerify(jwt, await getPublicJwkSet(), {
      issuer: appConfig.oauthUrl,
      audience: audiences,
    });
    const claims = payload as typeof payload &
      Partial<{ actor_kind: IssuedTokenClaims['actor_kind']; tenant_id: string; gid: string; key_id: string }> & {
        scope?: string;
        client_id?: string;
      };
    if (claims.sub && claims.tenant_id && claims.client_id) {
      const token = {
        actorId: claims.sub,
        tenantId: claims.tenant_id,
        scopes: accessScopes.parse(claims.scope),
        clientId: claims.client_id,
      };
      if (claims.actor_kind === 'user' && claims.gid) return { ...token, kind: 'user', grantId: claims.gid };
      if (claims.actor_kind === 'service' && claims.key_id) return { ...token, kind: 'service', keyId: claims.key_id };
    }
    throw new AppError(401, 'unauthorized', 'warn', { meta: { reason: 'invalid_token' } });
  } catch (error) {
    if (error instanceof AppError) throw error;
    const reason = error instanceof errors.JWTExpired ? 'token_expired' : 'invalid_token';
    throw new AppError(401, 'unauthorized', 'warn', { meta: { reason } });
  }
}
