import { eq } from 'drizzle-orm';
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from 'jose';
import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';
import {
  MCP_PROTECTED_RESOURCE_METADATA_URL,
  mcpResourceUri,
  OIDC_ISSUER,
  OIDC_JWKS_URI,
} from '#/modules/auth-server/oidc-constants';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { usersTable } from '#/modules/user/user-db';

/**
 * MCP resource-server guard: bearer-only, no cookies.
 *
 * Replaces the session `authGuard` on the MCP route. It validates an
 * OAuth/OIDC JWT access token issued by Cella's Authorization Server:
 * signature (via JWKS), issuer, audience (the canonical MCP resource URI for
 * this tenant/org), expiry, and required scope. It then resolves the token
 * `sub` to a Cella user and sets exactly the context keys the downstream
 * `tenantGuard`/`orgGuard` need (`user`, `userId`, `memberships`,
 * `isSystemAdmin`, `db`) — so tenant isolation is preserved unchanged.
 *
 * On failure it returns the MCP-mandated OAuth challenge:
 * `401 WWW-Authenticate: Bearer resource_metadata="..."` (with `error=...`) and
 * `403 insufficient_scope` for runtime scope step-up.
 *
 * The signing keys are validated against the Authorization Server's JWKS. The
 * resolver is a module-level indirection so tests can inject a local key set
 * (`createLocalJWKSet`) without a running server.
 *
 * @see https://modelcontextprotocol.io/specification/draft/basic/authorization
 * @see .todos/MCP_PLAN.md (Experiment 0)
 */

// Default resolver: fetch (and cache) the Authorization Server's public JWKS.
// Tests override via `setMcpJwksResolver`.
let jwksResolver: JWTVerifyGetKey = createRemoteJWKSet(new URL(OIDC_JWKS_URI));

/** Test seam: swap the JWKS resolver (e.g. a `createLocalJWKSet`). */
export function setMcpJwksResolver(resolver: JWTVerifyGetKey): void {
  jwksResolver = resolver;
}

/** Minimum scope required to reach the MCP endpoint at all. */
const REQUIRED_SCOPE = 'mcp:tools:read';

export const mcpAuthGuard = xMiddleware(
  {
    functionName: 'mcpAuthGuard',
    type: 'x-guard',
    name: 'mcpAuth',
    description: 'Requires a valid OAuth Bearer JWT (audience-bound to the MCP resource) and sets auth context',
  },
  async (ctx, next) => {
    // Always present on the `/:tenantId/:organizationId/mcp` route; `?? ''` keeps
    // the audience check fail-safe (an empty resource never matches a real token).
    const tenantId = ctx.req.param('tenantId') ?? '';
    const organizationId = ctx.req.param('organizationId') ?? '';
    const resource = mcpResourceUri(tenantId, organizationId);
    const metadataUrl = `${MCP_PROTECTED_RESOURCE_METADATA_URL}/${tenantId}/${organizationId}/mcp`;
    const challenge = (params = '') => `Bearer resource_metadata="${metadataUrl}"${params}`;

    // 1. Extract bearer token (cookies are ignored on MCP).
    const authHeader = ctx.req.header('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
    if (!token) {
      return ctx.json({ error: 'unauthorized', error_description: 'Bearer token required' }, 401, {
        'WWW-Authenticate': challenge(),
      });
    }

    // 2. Verify signature, issuer, audience, expiry.
    let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'];
    try {
      ({ payload } = await jwtVerify(token, jwksResolver, { issuer: OIDC_ISSUER, audience: resource }));
    } catch {
      return ctx.json({ error: 'invalid_token', error_description: 'Token validation failed' }, 401, {
        'WWW-Authenticate': challenge(', error="invalid_token"'),
      });
    }

    // 3. Scope check (per-method enforcement is a later MCP_PLAN.md phase).
    const scopes = typeof payload.scope === 'string' ? payload.scope.split(' ') : [];
    if (!scopes.includes(REQUIRED_SCOPE)) {
      return ctx.json({ error: 'insufficient_scope', scope: REQUIRED_SCOPE }, 403, {
        'WWW-Authenticate': challenge(`, error="insufficient_scope", scope="${REQUIRED_SCOPE}"`),
      });
    }

    // 4. Resolve subject to a Cella user. Service clients (client_credentials,
    //    sub = client_id) don't map to a user yet — deferred to worker-auth phase.
    //    The lookup is wrapped so a non-UUID/unknown subject fails closed as 401
    //    rather than surfacing a Postgres uuid cast error as a 500.
    const subject = typeof payload.sub === 'string' ? payload.sub : '';
    const [user] = await baseDb
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, subject))
      .limit(1)
      .catch(() => []);
    if (!user) {
      return ctx.json({ error: 'invalid_token', error_description: 'Subject is not a Cella user' }, 401, {
        'WWW-Authenticate': challenge(', error="invalid_token"'),
      });
    }

    // 5. Populate auth context for downstream tenantGuard/orgGuard (unchanged).
    const memberships = await baseDb.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id));
    ctx.set('user', user);
    ctx.set('userId', user.id);
    ctx.set('memberships', memberships);
    ctx.set('isSystemAdmin', false);
    ctx.set('db', baseDb);

    await next();
  },
);
