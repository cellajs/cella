import { z } from '@hono/zod-openapi';
import { appConfig, type ChannelEntityType, hierarchy } from 'shared';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { maxLength } from '#/db/utils/constraints';
import { env } from '#/env';
import { i18n } from '#/lib/i18n';
import { readMemberships } from '#/middlewares/guard/membership-cache';
import { spendHandoffToken } from '#/modules/auth/core/tokens/token-lifecycle';
import { ltiClaims } from '#/modules/auth/flows/lti/lti-schema';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { signLtiIdToken } from '#/modules/lti-platform/helpers/id-token';
import { launchCustom, launchTargetLinkUri } from '#/modules/lti-platform/helpers/launch-message';
import { releasedClaims } from '#/modules/lti-platform/helpers/platform-offer';
import { ltiContextTypes, ltiRolesFor } from '#/modules/lti-platform/launch-context';
import { findLtiLaunchTarget, findLtiRegistration } from '#/modules/lti-platform/lti-platform-queries';
import { findServedUserById } from '#/modules/user/user-queries';
import { getValidChannel } from '#/permissions/get-valid-channel';
import type { EntityModel } from '#/tables';
import { log } from '#/utils/logger';

const dbCtx = { var: { db: baseDb } };

const requestParam = z.string().max(maxLength.url).optional();

/** The OIDC authentication request of a launch (1EdTech Security Framework 1.0, section 5.1.1.2), as GET query or POST form. */
const authenticationRequestSchema = z.object({
  scope: requestParam,
  response_type: requestParam,
  response_mode: requestParam,
  prompt: requestParam,
  client_id: requestParam,
  redirect_uri: requestParam,
  login_hint: requestParam,
  lti_message_hint: requestParam,
  nonce: requestParam,
  state: requestParam,
});

/** How the launch endpoint answers: a page posting to the LTI tool, or a refusal no address of the LTI tool hears. */
export type LtiLaunchAnswer =
  | { post: { action: string; fields: Record<string, string>; formOrigins: string[] } }
  | { refusal: { status: 400; text: string } };

/** An error the launch posts back to the registered `redirect_uri` (OpenID Connect Core, section 3.1.2.6). */
class LaunchError extends Error {
  constructor(
    readonly error: string,
    readonly description: string,
  ) {
    super(description);
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The checks of section 5.1.1.2 a request passes before its launch record is read, in the order the spec lists them. */
const assertAuthenticationRequest = (request: z.infer<typeof authenticationRequestSchema>) => {
  if (!request.scope?.split(' ').includes('openid')) throw new LaunchError('invalid_scope', 'scope must be openid');
  if (request.response_type !== 'id_token') throw new LaunchError('unsupported_response_type', 'response_type must be id_token');
  if (request.response_mode !== 'form_post') throw new LaunchError('invalid_request', 'response_mode must be form_post');
  if (!request.nonce) throw new LaunchError('invalid_request', 'nonce is required');
  if (request.prompt !== 'none') throw new LaunchError('invalid_request', 'prompt must be none');
  const { login_hint: loginHint, lti_message_hint: messageHint } = request;
  if (!loginHint || !messageHint || !uuidPattern.test(loginHint)) throw new LaunchError('login_required', 'no launch matches the hints');
  return { nonce: request.nonce, loginHint, messageHint };
};

/**
 * Spends the launch record the hints name and finds what it launches: a resource link of an installation of the
 * requesting client, in the record's tenant. A spent, expired or foreign record finds nothing.
 */
const spendLaunchRecord = async ({ loginHint, messageHint, clientId }: { loginHint: string; messageHint: string; clientId: string }) => {
  const record = await spendHandoffToken({ kind: 'lti-launch', rawToken: messageHint, id: loginHint }).catch((err) => {
    if (err instanceof AppError && err.status === 401) return null;
    throw err;
  });
  const target = record?.ltiResourceLinkId ? await findLtiLaunchTarget(dbCtx, { resourceLinkId: record.ltiResourceLinkId }) : undefined;
  if (!record?.createdBy || !target || target.client.id !== clientId || target.resourceLink.tenantId !== record.tenantId) {
    throw new LaunchError('login_required', 'no launch matches the hints');
  }
  return { personId: record.createdBy, target };
};

type LaunchTarget = NonNullable<Awaited<ReturnType<typeof findLtiLaunchTarget>>>;

/**
 * The channel a launch names as its LTI context: the resource link's own channel when it is one, else its nearest
 * ancestor that is, else none (`ltiContextTypes`).
 */
const findContextChannel = async (channelType: ChannelEntityType, channel: EntityModel<ChannelEntityType>) => {
  const types = ltiContextTypes(channelType);
  if (types) return { channelType, channel, types };
  for (const ancestor of hierarchy.resolveNonNullAncestors(channelType, channel)) {
    const ancestorTypes = ltiContextTypes(ancestor.type);
    if (!ancestorTypes) continue;
    const found = await resolveEntity(dbCtx, { entityType: ancestor.type, identifier: ancestor.id });
    return found ? { channelType: ancestor.type, channel: found, types: ancestorTypes } : null;
  }
  return null;
};

/**
 * Who launches, checked at this moment: the installation approved and active, and the person still able to read the
 * resource link's channel. A launch carries no system admin, as a token does not.
 */
const assertLaunchAllowed = async ({ personId, target }: { personId: string; target: LaunchTarget }) => {
  const { account, installation, resourceLink } = target;
  if (!installation.approvedAt || account.status !== 'active') throw new LaunchError('unauthorized_client', 'the installation is not active');

  const person = await findServedUserById(dbCtx, { id: personId });
  const { memberships } = await readMemberships(personId);
  if (!person) throw new LaunchError('access_denied', 'the person may not read the placement');
  const readerCtx = {
    var: {
      db: baseDb,
      tenantId: resourceLink.tenantId,
      organizationId: resourceLink.organizationId,
      actor: { id: personId, bindings: memberships, scopes: null },
      isSystemAdmin: false,
    },
  };
  const read = await getValidChannel(readerCtx, resourceLink.channelId, resourceLink.channelType, 'read').catch((err) => {
    if (err instanceof AppError && err.status === 404) return null;
    throw err;
  });
  if (!read) throw new LaunchError('access_denied', 'the person may not read the placement');
  return { person, memberships, channel: read.entity };
};

/** The claims of a resource link launch (LTI Core 1.3, sections 5.3 and 5.4), without the times the signer sets. */
const launchClaims = async ({ nonce, target, personId }: { nonce: string; target: LaunchTarget; personId: string }) => {
  const { account, installation, client, resourceLink } = target;
  const { person, memberships, channel } = await assertLaunchAllowed({ personId, target });

  const context = await findContextChannel(resourceLink.channelType, channel);
  const role = context && memberships.find((membership) => membership.channelId === context.channel.id)?.role;
  const custom = launchCustom(client, resourceLink.custom);

  return {
    iss: appConfig.oauthUrl,
    aud: client.id,
    azp: client.id,
    sub: personId,
    nonce,
    ...releasedClaims(installation.releasedFields, client.ltiToolConfig.claims, person),
    [ltiClaims.messageType]: 'LtiResourceLinkRequest',
    [ltiClaims.version]: '1.3.0',
    [ltiClaims.deploymentId]: account.id,
    [ltiClaims.targetLinkUri]: launchTargetLinkUri(client),
    [ltiClaims.resourceLink]: { id: resourceLink.id, title: resourceLink.title },
    [ltiClaims.roles]: context && role ? ltiRolesFor(context.channelType, role) : [],
    ...(context && {
      [ltiClaims.context]: { id: context.channel.id, label: context.channel.slug, title: context.channel.name, type: context.types },
    }),
    ...(Object.keys(custom).length && { [ltiClaims.custom]: custom }),
    [ltiClaims.launchPresentation]: { document_target: 'iframe', locale: person.languageCode },
    [ltiClaims.toolPlatform]: { guid: resourceLink.tenantId, name: appConfig.name, product_family_code: appConfig.slug, version: env.RELEASE_SHA },
  };
};

/**
 * The launch endpoint (1EdTech Security Framework 1.0, section 5.1.1): checks the authentication request an LTI tool
 * sends the browser with, spends its launch record and answers a page that posts the signed ID token to the LTI tool.
 * No session reaches it: the record names the person, and the checks of the start run again now. A request without a
 * known LTI `client_id` or with a `redirect_uri` that client did not register is refused in place; any other refusal is
 * posted back to that `redirect_uri` as an error with the request's `state`.
 */
export async function authorizeLtiLaunchOp(params: Record<string, unknown>): Promise<LtiLaunchAnswer> {
  const parsed = authenticationRequestSchema.safeParse(params);
  const request = parsed.success ? parsed.data : undefined;
  const registration = request?.client_id ? await findLtiRegistration(dbCtx, { clientId: request.client_id }) : undefined;
  const redirectUri = request?.redirect_uri;
  if (!request || !registration || !redirectUri || !registration.redirectUris.includes(redirectUri)) {
    log.warn('LTI launch refused in place', { clientId: request?.client_id });
    return { refusal: { status: 400, text: i18n.t('error:lti_launch_refused') } };
  }

  const answer = (fields: Record<string, string>) => ({
    post: { action: redirectUri, fields: { ...fields, ...(request.state && { state: request.state }) }, formOrigins: [new URL(redirectUri).origin] },
  });

  try {
    const { nonce, loginHint, messageHint } = assertAuthenticationRequest(request);
    const { personId, target } = await spendLaunchRecord({ loginHint, messageHint, clientId: registration.id });
    const idToken = await signLtiIdToken(await launchClaims({ nonce, target, personId }));
    log.info('LTI launch', { clientId: registration.id, resourceLinkId: target.resourceLink.id, installationId: target.account.id });
    return answer({ id_token: idToken });
  } catch (err) {
    if (!(err instanceof LaunchError)) throw err;
    log.warn('LTI launch refused', { clientId: registration.id, error: err.error, reason: err.description });
    return answer({ error: err.error, error_description: err.description });
  }
}
