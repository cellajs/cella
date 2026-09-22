import type { Context } from 'hono';
import { errors, jwtVerify } from 'jose';
import { appConfig, type EntityScope, scopes } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { getVerificationKeySet } from '#/modules/oauth-server/keystore';
import type { CellaTokenClaims } from '#/modules/oauth-server/provider';
import { resourceUri } from '#/modules/oauth-server/resources';

export interface VerifiedAccessToken {
  principalId: string;
  kind: 'user' | 'service';
  tenantId: string;
  /** The token's scope set, always a mask: a delegated token never carries a principal's full grants implicitly. */
  scopes: EntityScope[];
  clientId: string;
}

/** A bearer value that is a JWT (three segments); this app's opaque keys carry no dots. */
export function bearerJwtFrom(ctx: Context<Env>): string | null {
  const bearer = ctx.req.header('authorization');
  if (!bearer?.toLowerCase().startsWith('bearer ')) return null;
  const value = bearer.slice(7).trim();
  return value.split('.').length === 3 ? value : null;
}

/**
 * Verifies a cella-issued access token locally against the keystore (no self-HTTP, no DB row per token) and binds it
 * to the route's tenant and organization: the audience must be one of this route's resources (RFC 8707).
 */
export async function verifyAccessToken(
  jwt: string,
  route: { tenantId: string; organizationId?: string },
): Promise<VerifiedAccessToken> {
  const audiences = [resourceUri({ face: 'api', tenantId: route.tenantId })];
  if (route.organizationId)
    audiences.push(resourceUri({ face: 'mcp', tenantId: route.tenantId, organizationId: route.organizationId }));

  try {
    const { payload } = await jwtVerify(jwt, await getVerificationKeySet(), {
      issuer: appConfig.oauthUrl,
      audience: audiences,
    });
    const claims = payload as typeof payload & Partial<CellaTokenClaims> & { scope?: string; client_id?: string };
    if (!claims.sub || !claims.cella_kind || !claims.tenant_id)
      throw new AppError(401, 'unauthorized', 'warn', { meta: { reason: 'invalid_token' } });
    const granted = (claims.scope ?? '')
      .split(' ')
      .filter((scope): scope is EntityScope => (scopes.all as readonly string[]).includes(scope));
    return {
      principalId: claims.sub,
      kind: claims.cella_kind,
      tenantId: claims.tenant_id,
      scopes: granted,
      clientId: claims.client_id ?? '',
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    const reason = error instanceof errors.JWTExpired ? 'token_expired' : 'invalid_token';
    throw new AppError(401, 'unauthorized', 'warn', { meta: { reason } });
  }
}
