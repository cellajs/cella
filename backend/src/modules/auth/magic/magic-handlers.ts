import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { deleteAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { authMagicLinkRoutes } from '#/modules/auth/magic/magic-routes';
import { handleMagicLink } from '#/modules/auth/magic/operations/handle-magic-link';
import { findOpenableMagicLink, readHeldMagicLink } from '#/modules/auth/magic/operations/magic-link-browser';
import { claimMagicLinkHolder } from '#/modules/auth/magic/operations/magic-sign-up';
import { sendMagicLinkOp } from '#/modules/auth/magic/operations/send-magic-link';
import { invokeToken } from '#/modules/auth/tokens/token-lifecycle';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

app.openapi(authMagicLinkRoutes.sendMagicLink, async (ctx) => {
  const { email, redirect } = ctx.req.valid('json');
  await sendMagicLinkOp(ctx, { email, redirect });
  return ctx.body(null, 204);
});

app.openapi(authMagicLinkRoutes.getPendingMagicLink, async (ctx) => {
  const token = await findOpenableMagicLink(await readHeldMagicLink(ctx));
  // The full address: a masked one looks alike for two accounts on one domain, so a planted link would pass unnoticed.
  return ctx.json({ email: token.email }, 200);
});

app.openapi(authMagicLinkRoutes.confirmMagicLink, async (ctx) => {
  const rawToken = await readHeldMagicLink(ctx);

  // Redeemed like opening the link in its own browser, including the refusal while signed in as someone else.
  const tokenRecord = await invokeToken(ctx, { type: 'magic', rawToken, claimHolder: claimMagicLinkHolder });
  deleteAuthCookie(ctx, 'magic-pending');

  return handleMagicLink(ctx, tokenRecord);
});

export const authMagicLinkHandlers = app;
