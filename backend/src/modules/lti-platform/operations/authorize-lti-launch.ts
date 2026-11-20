import { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { maxLength } from '#/db/utils/constraints';
import { env } from '#/env';
import { ltiClaims, ltiNrps } from '#/lib/lti-vocabulary';
import { loadArchivedChannelIds } from '#/middlewares/guard/archived-channels-cache';
import { spendHandoffToken } from '#/modules/auth/core';
import { linkContext, ltiTabClosure } from '#/modules/lti-platform/helpers/context-channel';
import { signLtiIdToken } from '#/modules/lti-platform/helpers/id-token';
import { launchCustom, launchNamesRoleService, launchOrigins, launchTargetLinkUri } from '#/modules/lti-platform/helpers/launch-message';
import { ltiLaunchRoles } from '#/modules/lti-platform/helpers/lti-roles';
import { ltiServiceScope } from '#/modules/lti-platform/helpers/lti-service-scopes';
import { ltiIssuerUrl, releasedClaims } from '#/modules/lti-platform/helpers/platform-offer';
import { findLtiLaunchTarget, findLtiRegistration } from '#/modules/lti-platform/lti-platform-queries';
import { readAsLauncher } from '#/modules/lti-platform/operations/start-lti-launch';
import { findServedUserById } from '#/modules/user/user-queries';
import { log } from '#/utils/logger';

const dbCtx = { var: { db: baseDb } };

const requestParam = z.string().max(maxLength.url).optional();

/**
 * The OIDC authentication request of a launch (1EdTech Security Framework 1.0, section 5.1.1.2), as GET query or POST
 * form. `resubmitted` is the platform's own: its page sets it when it sends the request on (`resubmission`).
 */
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
  resubmitted: requestParam,
});

type AuthenticationRequest = z.infer<typeof authenticationRequestSchema>;

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
const assertAuthenticationRequest = (request: AuthenticationRequest) => {
  if (!request.scope?.split(' ').includes('openid')) throw new LaunchError('invalid_scope', 'scope must be openid');
  if (request.response_type !== 'id_token') throw new LaunchError('unsupported_response_type', 'response_type must be id_token');
  if (request.response_mode !== 'form_post') throw new LaunchError('invalid_request', 'response_mode must be form_post');
  if (!request.nonce) throw new LaunchError('invalid_request', 'nonce is required');
  if (request.prompt !== 'none') throw new LaunchError('invalid_request', 'prompt must be none');
  const { login_hint: loginHint, lti_message_hint: messageHint } = request;
  if (!loginHint || !messageHint || !uuidPattern.test(loginHint)) throw new LaunchError('login_required', 'no launch matches the hints');
  return { nonce: request.nonce, loginHint, messageHint };
};

interface LaunchRecordRef {
  loginHint: string;
  messageHint: string;
  clientId: string;
  sessionId: string;
}

/**
 * Spends the launch record the hints name, when the session that started it presents it, and finds what it launches:
 * a resource link of an installation of the requesting client, in the record's tenant. A spent, expired or foreign
 * record finds nothing, and so does one another session presents, which stays for its own.
 */
const spendLaunchRecord = async ({ loginHint, messageHint, clientId, sessionId }: LaunchRecordRef) => {
  const record = await spendHandoffToken({ kind: 'lti-launch', rawToken: messageHint, id: loginHint, sessionId }).catch((err) => {
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

/** Who launches, checked at this moment: the tab opens (`ltiTabClosure`), and the person may open it. */
const assertLaunchAllowed = async ({ personId, target }: { personId: string; target: LaunchTarget }) => {
  const { resourceLink } = target;
  const { tenantId, organizationId } = resourceLink;
  const archivedChannelIds = await loadArchivedChannelIds(dbCtx, { tenantId, organizationId });
  const closure = ltiTabClosure({ ...target, link: resourceLink, archivedChannelIds });
  if (closure === 'lti_installation_not_active') throw new LaunchError('unauthorized_client', 'the installation is not active');
  if (closure) throw new LaunchError('access_denied', `the tab does not open: ${closure}`);

  const person = await findServedUserById(dbCtx, { id: personId });
  const launcher =
    person &&
    (await readAsLauncher(personId, resourceLink).catch((err) => {
      if (err instanceof AppError && err.status === 404) return null;
      throw err;
    }));
  if (!person || !launcher) throw new LaunchError('access_denied', 'the person may not open the tab');
  return { person, ...launcher };
};

/**
 * The claims of a resource link launch (LTI Core 1.3, sections 5.3 and 5.4), without the times the signer sets. The
 * context is the resource link's own channel when it is one (`linkContext`). The NRPS claim goes only with a context,
 * to an LTI tool an admin granted the access scope the NRPS scope stands for.
 */
const launchClaims = async ({ nonce, target, personId }: { nonce: string; target: LaunchTarget; personId: string }) => {
  const { account, installation, client, resourceLink } = target;
  const { person, memberships, channel } = await assertLaunchAllowed({ personId, target });

  const context = linkContext(resourceLink);
  const roles = ltiLaunchRoles({ personId, memberships, link: resourceLink, channel });
  const custom = launchCustom(client, resourceLink.custom);
  const readsMembers = installation.grantedScopes.some((scope) => ltiServiceScope(scope) === ltiNrps.scope);

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
    [ltiClaims.roles]: roles,
    ...(context && {
      [ltiClaims.context]: { id: channel.id, label: channel.slug, title: channel.name, type: context.types },
    }),
    ...(Object.keys(custom).length && { [ltiClaims.custom]: custom }),
    [ltiClaims.launchPresentation]: { document_target: 'iframe', locale: person.languageCode },
    [ltiClaims.toolPlatform]: { guid: resourceLink.tenantId, name: appConfig.name, product_family_code: appConfig.slug, version: env.RELEASE_SHA },
    ...(context && readsMembers && { [ltiClaims.namesRoleService]: launchNamesRoleService(resourceLink, context) }),
  };
};

/**
 * The platform's page that sends an authentication request on to the launch endpoint, as a form post from the app's
 * origin. A navigation another site starts carries no session cookie, and the post this page makes does.
 */
const resubmission = (request: AuthenticationRequest) => {
  const action = ltiIssuerUrl('authorization');
  const fields = Object.fromEntries(Object.entries(request).flatMap(([name, value]) => (value === undefined ? [] : [[name, value]])));
  return { action, fields: { ...fields, resubmitted: '1' }, formOrigins: [new URL(action).origin] };
};

/**
 * The launch endpoint (1EdTech Security Framework 1.0, section 5.1.1): checks the authentication request an LTI tool
 * sends the browser with, spends its launch record and answers the page that posts the signed ID token to the LTI tool.
 * It signs only for the browser session that started the launch (section 5.1.1.3), whose person the record names, and
 * the checks of the start run again now. A request without the session cookie is answered with the `resubmission`
 * page once; with no session then, or another session than the record's, it fails with `login_required`, as `prompt`
 * none asks. Any refusal is posted back to the request's `redirect_uri` as an error with its `state`, unless no address
 * of the LTI tool may hear it.
 * @param sessionId - The app session the request presents, null without one.
 * @throws AppError 400 `lti_launch_refused` for a request without a known LTI `client_id` or with a `redirect_uri`
 *   that client did not register, refused in place.
 */
export async function authorizeLtiLaunchOp(params: Record<string, unknown>, sessionId: string | null) {
  const parsed = authenticationRequestSchema.safeParse(params);
  const request = parsed.success ? parsed.data : undefined;
  const registration = request?.client_id ? await findLtiRegistration(dbCtx, { clientId: request.client_id }) : undefined;
  const redirectUri = request?.redirect_uri;
  if (!request || !registration || !redirectUri || !registration.redirectUris.includes(redirectUri)) {
    // An LTI tool's admin reads which address was offered: commonly a target with a query its library sent as is.
    throw new AppError(400, 'lti_launch_refused', 'warn', { meta: { clientId: request?.client_id ?? null, redirectUri: redirectUri ?? null } });
  }

  // The LTI tool's endpoint may redirect to any address of its own that it registered.
  const answer = (fields: Record<string, string>) => ({
    action: redirectUri,
    fields: { ...fields, ...(request.state && { state: request.state }) },
    formOrigins: launchOrigins(registration),
  });

  try {
    const { nonce, loginHint, messageHint } = assertAuthenticationRequest(request);
    if (!sessionId) {
      if (request.resubmitted) throw new LaunchError('login_required', 'no session in this browser');
      return resubmission(request);
    }
    const { personId, target } = await spendLaunchRecord({ loginHint, messageHint, clientId: registration.id, sessionId });
    const idToken = await signLtiIdToken(await launchClaims({ nonce, target, personId }));
    log.info('LTI launch', { clientId: registration.id, resourceLinkId: target.resourceLink.id, installationId: target.account.id });
    return answer({ id_token: idToken });
  } catch (err) {
    if (!(err instanceof LaunchError)) throw err;
    log.warn('LTI launch refused', { clientId: registration.id, error: err.error, reason: err.description });
    return answer({ error: err.error, error_description: err.description });
  }
}
