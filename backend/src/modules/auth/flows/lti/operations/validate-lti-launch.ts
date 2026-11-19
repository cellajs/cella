import { z } from '@hono/zod-openapi';
import { decodeJwt, decodeProtectedHeader, type JWTPayload, type ProtectedHeaderParameters } from 'jose';
import { appConfig } from 'shared';
import { AppError, type ErrorKey } from '#/core/error';
import { baseDb } from '#/db/db';
import { maxLength } from '#/db/utils/constraints';
import { ltiClaims, ltiTestUserRole } from '#/lib/lti-vocabulary';
import { spendHandoffToken } from '#/modules/auth/core/tokens/token-lifecycle';
import type { LaunchState } from '#/modules/auth/flows/lti/helpers/launch-state';
import { isSignedByPlatform } from '#/modules/auth/flows/lti/helpers/platform-key-set';
import { ltiIdSchema, profileClaim } from '#/modules/auth/flows/lti/lti-schema';
import type { LtiConnection } from '#/modules/connections/connections-db';
import { findActiveLtiConnections } from '#/modules/connections/connections-queries';

const dbCtx = { var: { db: baseDb } };

/** How far a launch's `iat` may lie from now either way: a platform's clock drifts, and a launch takes seconds. */
const issuedAtWindowSeconds = 5 * 60;

/** The claims a valid launch carries, as the launch reads them after every rule passed. */
const ltiLaunchSchema = z.object({
  sub: ltiIdSchema,
  name: profileClaim,
  given_name: profileClaim,
  family_name: profileClaim,
  email: profileClaim,
  [ltiClaims.deploymentId]: ltiIdSchema,
  [ltiClaims.roles]: z.array(z.string().max(maxLength.url)).max(100),
  [ltiClaims.context]: z
    .object({
      id: ltiIdSchema,
      label: profileClaim,
      title: profileClaim,
      type: z.array(z.string().max(maxLength.field)).max(20).optional(),
    })
    .optional(),
});

export type LtiLaunch = z.infer<typeof ltiLaunchSchema>;

/** What every rule reads: the token, the connection its issuer and audience name, and what the frame posted with it. */
interface LaunchFacts {
  token: string;
  header: ProtectedHeaderParameters;
  claims: JWTPayload;
  connection: LtiConnection;
  state: LaunchState;
  /** The value platform storage held for the frame under the state's nonce. */
  storageValue: string;
  nowSeconds: number;
}

interface LaunchRule {
  rule: string;
  holds: (facts: LaunchFacts) => boolean | Promise<boolean>;
  /** The refusal when the rule fails; 401 `lti_launch_invalid` naming the rule by default. */
  refusal?: { status: 403; type: ErrorKey };
}

const audiences = ({ aud }: JWTPayload) => (aud === undefined ? [] : Array.isArray(aud) ? aud : [aud]);

const isUuid = (value: unknown): value is string => z.uuid().safeParse(value).success;

const rolesOf = (claims: JWTPayload) => {
  const roles = claims[ltiClaims.roles];
  return Array.isArray(roles) ? roles : [];
};

/**
 * The checks of a launch, one row per rule, in the order of the 1EdTech Security Framework 1.0 (section 5.1.3) and
 * then LTI Core 1.3 (section 5.3). The first that fails refuses the launch.
 */
const launchRules: LaunchRule[] = [
  { rule: 'signature', holds: ({ token, connection }) => isSignedByPlatform(token, connection) },
  { rule: 'alg', holds: ({ header }) => header.alg === 'RS256' },
  { rule: 'issuer', holds: ({ claims, connection }) => claims.iss === connection.issuer },
  { rule: 'audience', holds: ({ claims, connection }) => audiences(claims).includes(connection.clientId) },
  {
    rule: 'authorized_party',
    holds: ({ claims, connection }) => (claims.azp === undefined ? audiences(claims).length === 1 : claims.azp === connection.clientId),
  },
  { rule: 'expiry', holds: ({ claims, nowSeconds }) => typeof claims.exp === 'number' && nowSeconds < claims.exp },
  {
    rule: 'issued_at',
    holds: ({ claims, nowSeconds }) => typeof claims.iat === 'number' && Math.abs(nowSeconds - claims.iat) <= issuedAtWindowSeconds,
  },
  // The nonce is the login's one-use token: spent here with the value platform storage held, so a replay finds nothing.
  {
    rule: 'nonce',
    holds: async ({ claims, connection, state, storageValue }) => {
      if (!isUuid(claims.nonce) || claims.nonce !== state.nonce) return false;
      const spent = await spendHandoffToken({ kind: 'lti-nonce', rawToken: storageValue, id: claims.nonce });
      return spent.connectionId === connection.id;
    },
  },
  { rule: 'message_type', holds: ({ claims }) => claims[ltiClaims.messageType] === 'LtiResourceLinkRequest' },
  { rule: 'version', holds: ({ claims }) => claims[ltiClaims.version] === '1.3.0' },
  // A connection whose platform named no deployment at registration takes on the first one a launch names.
  {
    rule: 'deployment_id',
    holds: ({ claims, connection: { config } }) => {
      const deploymentId = ltiIdSchema.safeParse(claims[ltiClaims.deploymentId]).data;
      return !!deploymentId && (config.deploymentIds.includes(deploymentId) || config.deploymentIds.length === 0);
    },
    refusal: { status: 403, type: 'lti_deployment_unknown' },
  },
  {
    rule: 'target_link_uri',
    holds: ({ claims }) => {
      const target = claims[ltiClaims.targetLinkUri];
      return typeof target === 'string' && URL.canParse(target) && new URL(target).origin === new URL(appConfig.backendUrl).origin;
    },
  },
  {
    rule: 'resource_link',
    holds: ({ claims }) => z.object({ id: ltiIdSchema }).safeParse(claims[ltiClaims.resourceLink]).success,
  },
  { rule: 'context', holds: ({ claims }) => ltiLaunchSchema.shape[ltiClaims.context].safeParse(claims[ltiClaims.context]).success },
  { rule: 'sub', holds: ({ claims }) => ltiIdSchema.safeParse(claims.sub).success, refusal: { status: 403, type: 'lti_launch_anonymous' } },
  // An empty list is a launch without a role (LTI Core 1.3, section 5.3.7): the app-owned mapping answers it.
  { rule: 'roles', holds: ({ claims }) => Array.isArray(claims[ltiClaims.roles]), refusal: { status: 403, type: 'lti_launch_no_roles' } },
  { rule: 'test_user', holds: ({ claims }) => !rolesOf(claims).includes(ltiTestUserRole), refusal: { status: 403, type: 'lti_launch_test_user' } },
];

/** The header and claims of a token, unverified; undefined for one that does not parse. */
const decodeLaunch = (token: string) => {
  try {
    return { header: decodeProtectedHeader(token), claims: decodeJwt(token) };
  } catch {
    return undefined;
  }
};

/**
 * The connection a launch names: the active LTI connection of its issuer whose client id is its authorized party, or
 * else one of its audiences. Read before any check, which all need it; nothing of the token is trusted yet.
 * @throws AppError 401 `lti_launch_invalid` for a token that does not parse, 401 `lti_platform_unknown` when no
 *   connection matches.
 */
export const findLaunchConnection = async (token: string) => {
  const decoded = decodeLaunch(token);
  if (!decoded) throw new AppError(401, 'lti_launch_invalid', 'warn', { meta: { rule: 'parse' } });
  const { iss } = decoded.claims;
  const clientIds = typeof decoded.claims.azp === 'string' ? [decoded.claims.azp] : audiences(decoded.claims).slice(0, 10);
  const [connection] = typeof iss === 'string' && clientIds.length ? await findActiveLtiConnections(dbCtx, { issuer: iss, clientIds }) : [];
  if (!connection) throw new AppError(401, 'lti_platform_unknown', 'warn', { meta: { issuer: iss ?? null } });
  return { connection, ...decoded };
};

/**
 * Checks a launch against every rule (`launchRules`) and spends its nonce.
 * @returns The claims the launch acts on.
 * @throws AppError 401 `lti_launch_invalid` naming the failed rule in `meta.rule`, 403 `lti_deployment_unknown`,
 *   `lti_launch_anonymous`, `lti_launch_no_roles` or `lti_launch_test_user`, 401 `lti-nonce_not_found` or
 *   `lti-nonce_expired`, and what reading the platform's key set throws.
 */
export const validateLtiLaunch = async (facts: Omit<LaunchFacts, 'nowSeconds'>): Promise<LtiLaunch> => {
  const checked = { ...facts, nowSeconds: Math.floor(Date.now() / 1000) };
  for (const { rule, holds, refusal } of launchRules) {
    if (await holds(checked)) continue;
    const meta = { rule, connectionId: facts.connection.id };
    throw refusal ? new AppError(refusal.status, refusal.type, 'warn', { meta }) : new AppError(401, 'lti_launch_invalid', 'warn', { meta });
  }
  const launch = ltiLaunchSchema.safeParse(facts.claims);
  if (!launch.success) throw new AppError(401, 'lti_launch_invalid', 'warn', { meta: { rule: 'claims', connectionId: facts.connection.id } });
  return launch.data;
};
