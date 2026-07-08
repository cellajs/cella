import { eq } from 'drizzle-orm';
import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from 'jose';
import type { McpActor } from '#/core/context';
import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';
import { env } from '#/env';
import {
  MCP_PROTECTED_RESOURCE_METADATA_URL,
  mcpResourceUri,
  OIDC_ISSUER,
  OIDC_JWKS_URI,
} from '#/modules/auth-server/oidc-constants';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import type { UserModel } from '#/modules/user/user-db';
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

// Default resolver: fetch (and cache) the Authorization Server's public JWKS,
// with bounded fetch time and a cooldown to avoid hammering the AS on a burst of
// unknown-kid tokens. Tests override via `setMcpJwksResolver`.
let jwksResolver: JWTVerifyGetKey = createRemoteJWKSet(new URL(OIDC_JWKS_URI), {
  timeoutDuration: 5_000,
  cooldownDuration: 30_000,
  cacheMaxAge: 10 * 60_000,
});

/** Test seam: swap the JWKS resolver (e.g. a `createLocalJWKSet`). */
export function setMcpJwksResolver(resolver: JWTVerifyGetKey): void {
  jwksResolver = resolver;
}

/** Minimum scope required to reach the MCP endpoint at all. */
const REQUIRED_SCOPE = 'mcp:tools:read';

/**
 * Client ids allowed to act as MCP service actors. Normalized here because
 * `@t3-oss/env-core` skips its transform under vitest, so the value may arrive
 * as a string[], a raw comma string, or undefined.
 */
const SERVICE_CLIENT_IDS: string[] = Array.isArray(env.MCP_SERVICE_CLIENT_IDS)
  ? env.MCP_SERVICE_CLIENT_IDS
  : typeof env.MCP_SERVICE_CLIENT_IDS === 'string'
    ? (env.MCP_SERVICE_CLIENT_IDS as string)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

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

    ctx.set('db', baseDb);
    ctx.set('isSystemAdmin', false);

    // 4a. Service actor: a client_credentials token has `sub === client_id` and no
    //     user. It is already cryptographically bound to this tenant/org via `aud`
    //     (verified above); we additionally gate by an allowlist until per-client
    //     tenant binding lands (Phase 1). Authorize by synthesizing a membership
    //     scoped to exactly the token's tenant/org, so the shared tenantGuard/
    //     orgGuard authorize it without changes.
    const clientId = typeof payload.client_id === 'string' ? payload.client_id : undefined;
    const subject = typeof payload.sub === 'string' ? payload.sub : '';
    const isServiceToken = !!clientId && subject === clientId;

    if (isServiceToken) {
      if (!SERVICE_CLIENT_IDS.includes(clientId)) {
        return ctx.json({ error: 'invalid_client', error_description: 'Client may not act as an MCP service' }, 403, {
          'WWW-Authenticate': challenge(', error="invalid_client"'),
        });
      }

      // Minimal synthetic user + membership: only `.id`, `tenantId`,
      // `organizationId`, `contextType` are read by the downstream guards.
      const serviceMembership = {
        id: `mcp-service:${clientId}`,
        tenantId,
        organizationId,
        contextId: organizationId,
        contextType: 'organization',
        userId: clientId,
        role: 'member',
        createdBy: null,
      } as unknown as MembershipBaseModel & { createdBy: string | null };

      ctx.set('user', { id: clientId } as unknown as UserModel);
      ctx.set('userId', clientId);
      ctx.set('memberships', [serviceMembership]);
      ctx.set('mcpActor', { type: 'service', clientId, scopes } satisfies McpActor);

      return next();
    }

    // 4b. User actor: resolve the subject to a Cella user. The lookup is wrapped
    //     so a non-UUID/unknown subject fails closed as 401 rather than surfacing
    //     a Postgres uuid cast error as a 500.
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

    const memberships = await baseDb.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id));
    ctx.set('user', user);
    ctx.set('userId', user.id);
    ctx.set('memberships', memberships);
    ctx.set('mcpActor', { type: 'user', userId: user.id, scopes } satisfies McpActor);

    await next();
  },
);
