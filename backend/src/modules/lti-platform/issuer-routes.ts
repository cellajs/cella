import { type Context, Hono } from 'hono';
import type Provider from 'oidc-provider';
import { appConfig, servicePaths } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { env } from '#/env';
import { appErrorHandler } from '#/lib/error';
import { dynamicBodyLimit } from '#/middlewares/body-limit';
import { configSwitchGate } from '#/middlewares/config-switch';
import { ltiToolRegistrationLimiter } from '#/middlewares/rate-limiter/limiters';
import { ltiPlatformConfigurationMember } from '#/modules/auth/flows/lti/lti-schema';
import { ltiClaimsSupported, ltiIssuerPaths, ltiIssuerUrl, ltiMessageTypes } from '#/modules/lti-platform/helpers/platform-offer';
import { registerLtiToolOp } from '#/modules/lti-platform/operations/register-lti-tool';
import { runWithLogContext } from '#/utils/logger';

/**
 * The platform's OpenID configuration (LTI Dynamic Registration 1.0, section 2.1). The key set and the token endpoint
 * are the provider's own; the platform signs with RS256 keys only and takes LTI tools that authenticate with them.
 */
const platformConfiguration = (provider: Provider) => ({
  issuer: appConfig.oauthUrl,
  authorization_endpoint: ltiIssuerUrl('authorization'),
  registration_endpoint: ltiIssuerUrl('registration'),
  jwks_uri: provider.urlFor('jwks'),
  token_endpoint: provider.urlFor('token'),
  token_endpoint_auth_methods_supported: ['private_key_jwt'],
  token_endpoint_auth_signing_alg_values_supported: ['RS256'],
  // The spec requires `openid`; the platform serves no LTI service, so no service scope follows it.
  scopes_supported: ['openid'],
  response_types_supported: ['id_token'],
  subject_types_supported: ['public'],
  id_token_signing_alg_values_supported: ['RS256'],
  claims_supported: ltiClaimsSupported,
  [ltiPlatformConfigurationMember]: {
    product_family_code: appConfig.slug,
    version: env.RELEASE_SHA,
    messages_supported: ltiMessageTypes.map((type) => ({ type })),
  },
});

/** A registration error in the shape OpenID Connect Dynamic Client Registration gives it (section 3.3). */
const registrationError = (ctx: Context<Env>, status: 400 | 401, error: string, description?: string) => {
  if (status === 401) ctx.header('WWW-Authenticate', `Bearer error="${error}"`);
  return ctx.json({ error, ...(description && { error_description: description }) }, status);
};

const bearerToken = (header: string | undefined) => /^Bearer +(\S{1,512})$/i.exec(header ?? '')?.[1];

/**
 * The platform's LTI routes the OAuth worker serves under the issuer, beside the provider: the configuration an LTI
 * tool reads and the registration endpoint it posts to. Both answer 404 while `has.ltiPlatform` is off. The provider's
 * own dynamic client registration stays off: these routes admit an LTI tool only with a registration token.
 */
export function createLtiIssuerApp(provider: Provider): Hono<Env> {
  const app = new Hono<Env>();
  app.onError(appErrorHandler);
  app.use((ctx, next) => runWithLogContext(ctx, next));
  app.use(configSwitchGate({ feature: 'ltiPlatform' }));
  app.use(dynamicBodyLimit);

  app.get(`${servicePaths.oauth}${ltiIssuerPaths.configuration}`, (ctx) => ctx.json(platformConfiguration(provider)));

  app.post(`${servicePaths.oauth}${ltiIssuerPaths.registration}`, ltiToolRegistrationLimiter, async (ctx) => {
    const registrationToken = bearerToken(ctx.req.header('Authorization'));
    if (!registrationToken) return registrationError(ctx, 401, 'invalid_token');
    const body: unknown = await ctx.req.json().catch(() => undefined);
    try {
      return ctx.json(await registerLtiToolOp({ registrationToken, body }), 201);
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      if (err.status === 401) return registrationError(ctx, 401, 'invalid_token');
      if (err.type === 'lti_tool_metadata_invalid') return registrationError(ctx, 400, 'invalid_client_metadata', `Refused: ${err.meta?.member}`);
      throw err;
    }
  });

  return app;
}
