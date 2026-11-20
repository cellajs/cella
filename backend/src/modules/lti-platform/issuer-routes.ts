import { type Context, Hono } from 'hono';
import type Provider from 'oidc-provider';
import { servicePaths } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { appErrorHandler } from '#/lib/error';
import { dynamicBodyLimit } from '#/middlewares/body-limit';
import { configSwitchGate } from '#/middlewares/config-switch';
import { ltiLaunchLimiter, ltiToolRegistrationLimiter } from '#/middlewares/rate-limiter/limiters';
import { findSession } from '#/modules/auth/core';
import { autoPostPage, launchRefusalPage } from '#/modules/lti-platform/helpers/launch-pages';
import { ltiIssuerPaths, ltiPlatformConfiguration } from '#/modules/lti-platform/helpers/platform-offer';
import { authorizeLtiLaunchOp } from '#/modules/lti-platform/operations/authorize-lti-launch';
import { registerLtiToolOp } from '#/modules/lti-platform/operations/register-lti-tool';
import { runWithLogContext } from '#/utils/logger';

/** A registration error in the shape OpenID Connect Dynamic Client Registration gives it (section 3.3). */
const registrationError = (ctx: Context<Env>, status: 400 | 401, error: string, description?: string) => {
  if (status === 401) ctx.header('WWW-Authenticate', `Bearer error="${error}"`);
  return ctx.json({ error, ...(description && { error_description: description }) }, status);
};

const bearerToken = (header: string | undefined) => /^Bearer +(\S{1,512})$/i.exec(header ?? '')?.[1];

/** The parameters of a launch's authentication request: the query of a GET, the form of a POST. */
const authenticationParams = async (ctx: Context<Env>): Promise<Record<string, unknown>> =>
  ctx.req.method === 'POST' ? ctx.req.parseBody().catch(() => ({})) : ctx.req.query();

/**
 * The platform's LTI routes the OAuth worker serves under the issuer, beside the provider: the configuration an LTI
 * tool reads, the registration endpoint it posts to and the launch endpoint it sends the browser to, which reads the
 * app session. Each answers 404 while `has.ltiPlatform` is off. The provider's own dynamic client registration stays
 * off: these routes admit an LTI tool only with a registration token.
 */
export function createLtiIssuerApp(provider: Provider): Hono<Env> {
  const app = new Hono<Env>();
  app.onError(appErrorHandler);
  app.use((ctx, next) => runWithLogContext(ctx, next));
  app.use(configSwitchGate({ feature: 'ltiPlatform' }));
  app.use(dynamicBodyLimit);

  app.get(`${servicePaths.oauth}${ltiIssuerPaths.configuration}`, (ctx) =>
    ctx.json(ltiPlatformConfiguration({ jwksUri: provider.urlFor('jwks'), tokenEndpoint: provider.urlFor('token') })),
  );

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

  app.on(['GET', 'POST'], `${servicePaths.oauth}${ltiIssuerPaths.authorization}`, ltiLaunchLimiter, async (ctx) => {
    try {
      // The app's own session, never the embedded one: a launch starts on the app's pages.
      const session = await findSession(ctx, 'session');
      return autoPostPage(ctx, await authorizeLtiLaunchOp(await authenticationParams(ctx), session?.session.id ?? null));
    } catch (err) {
      if (!(err instanceof AppError) || err.type !== 'lti_launch_refused') throw err;
      return launchRefusalPage(ctx, err);
    }
  });

  return app;
}
