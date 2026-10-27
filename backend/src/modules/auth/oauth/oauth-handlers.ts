import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { authOAuthRoutes } from '#/modules/auth/oauth/oauth-routes';
import { finishOAuth, startOAuth } from '#/modules/auth/oauth/operations/provider-round-trip';
import { issueCookieToken } from '#/modules/auth/tokens/token-lifecycle';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(authOAuthRoutes.startOAuthConnect, async (ctx) => {
  const { user, session } = ctx.var;

  // The provider's callback is a navigation from another site: this Lax cookie's token is what names the account. It
  // serves only while the session that asked lives, so a sign-out (here or elsewhere) ends a connect left half-way.
  await issueCookieToken(ctx, { type: 'oauth-connect', userId: user.id, email: user.email, createdBy: user.id, sessionId: session.id });

  return ctx.body(null, 204);
});

app.openapi(authOAuthRoutes.github, (ctx) => startOAuth(ctx, 'github'));
app.openapi(authOAuthRoutes.google, (ctx) => startOAuth(ctx, 'google'));
app.openapi(authOAuthRoutes.microsoft, (ctx) => startOAuth(ctx, 'microsoft'));

app.openapi(authOAuthRoutes.githubCallback, (ctx) => finishOAuth(ctx, 'github'));
app.openapi(authOAuthRoutes.googleCallback, (ctx) => finishOAuth(ctx, 'google'));
app.openapi(authOAuthRoutes.microsoftCallback, (ctx) => finishOAuth(ctx, 'microsoft'));

export const authOAuthHandlers = app;
