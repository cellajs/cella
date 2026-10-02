import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { deleteAuthCookie, getAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { authMagicLinkRoutes } from '#/modules/auth/magic/magic-routes';
import { handleMagicLink } from '#/modules/auth/magic/operations/handle-magic';
import { findOpenableMagicLink } from '#/modules/auth/magic/operations/magic-link-browser';
import { claimMagicLinkOwner } from '#/modules/auth/magic/operations/magic-sign-up';
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
  const rawToken = await getAuthCookie(ctx, 'magic-pending');
  if (!rawToken) throw new AppError(401, 'magic_expired', 'warn');

  const token = await findOpenableMagicLink(rawToken);
  // The full address: a masked one looks alike for two accounts on one domain, so a planted link would pass unnoticed.
  return ctx.json({ email: token.email }, 200);
});

app.openapi(authMagicLinkRoutes.confirmMagicLink, async (ctx) => {
  const rawToken = await getAuthCookie(ctx, 'magic-pending');
  if (!rawToken) throw new AppError(401, 'magic_expired', 'warn');

  // Redeemed like opening the link in its own browser, including the refusal while signed in as someone else.
  const tokenRecord = await invokeToken(ctx, { type: 'magic', rawToken, claimOwner: claimMagicLinkOwner });
  deleteAuthCookie(ctx, 'magic-pending');

  return handleMagicLink(ctx, tokenRecord);
});

export const authMagicLinkHandlers = app;
