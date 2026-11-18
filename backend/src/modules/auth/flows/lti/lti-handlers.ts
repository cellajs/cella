import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { toClientError } from '#/lib/error';
import { i18n } from '#/lib/i18n';
import { registrationPage } from '#/modules/auth/flows/lti/helpers/registration-page';
import { authLtiRoutes } from '#/modules/auth/flows/lti/lti-routes';
import { registerLtiPlatformOp } from '#/modules/auth/flows/lti/operations/register-lti-platform';

const app = new OpenAPIHono<Env>();

// A refusal answers the same page with its own status: the platform's frame shows the outcome either way.
app.openapi(authLtiRoutes.registerLtiPlatform, async (ctx) => {
  try {
    await registerLtiPlatformOp(ctx.req.valid('query'));
    return registrationPage(ctx, i18n.t('backend:lti.registered'), 200);
  } catch (err) {
    const refusal = toClientError(err, { path: ctx.req.path, method: ctx.req.method }, { exposeServerMessage: false });
    return registrationPage(ctx, refusal.title, refusal.status);
  }
});

export const authLtiHandlers = app;
