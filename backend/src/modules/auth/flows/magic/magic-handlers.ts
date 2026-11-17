import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { assertSwitchOn } from '#/middlewares/config-switch';
import { deleteAuthCookie } from '#/modules/auth/core/general/helpers/cookie';
import { findFollowedInvitation } from '#/modules/auth/core/invitations/operations/accept-followed-invitation';
import { registerLinkHandler } from '#/modules/auth/core/tokens/operations/open-link-token';
import { forgetMagicLinkRequest, redeemToken } from '#/modules/auth/core/tokens/token-lifecycle';
import { authMagicLinkRoutes } from '#/modules/auth/flows/magic/magic-routes';
import { handleMagicLink } from '#/modules/auth/flows/magic/operations/handle-magic-link';
import { findOpenableMagicLink, holdMagicLinkOutsideItsBrowser, readHeldMagicLink } from '#/modules/auth/flows/magic/operations/magic-link-browser';
import { claimMagicLinkHolder } from '#/modules/auth/flows/magic/operations/magic-sign-up';
import { sendMagicLinkOp } from '#/modules/auth/flows/magic/operations/send-magic-link';

// What opening a magic link does. Only a magic link belongs to a sign-in method: the method's switch is checked here,
// per token kind.
registerLinkHandler('magic', async (ctx, rawToken) => {
  assertSwitchOn({ strategy: 'magic' });
  const held = await holdMagicLinkOutsideItsBrowser(ctx, rawToken);
  if (held) return held;

  const followed = await findFollowedInvitation(ctx);
  // A sign-up link creates its account at this click, which proves the inbox.
  const token = await redeemToken(ctx, { kind: 'magic', rawToken, claimHolder: claimMagicLinkHolder });
  forgetMagicLinkRequest(ctx);
  return handleMagicLink(ctx, token, followed);
});

const app = new OpenAPIHono<Env>();

app.openapi(authMagicLinkRoutes.sendMagicLink, async (ctx) => {
  const { email, redirectPath } = ctx.req.valid('json');
  await sendMagicLinkOp(ctx, { email, redirectPath });
  return ctx.body(null, 204);
});

app.openapi(authMagicLinkRoutes.getPendingMagicLink, async (ctx) => {
  const token = await findOpenableMagicLink(readHeldMagicLink(ctx));
  // The full address: a masked one looks alike for two accounts on one domain, and a planted link would pass unnoticed.
  return ctx.json({ email: token.email }, 200, { 'Cache-Control': 'no-store' });
});

app.openapi(authMagicLinkRoutes.confirmMagicLink, async (ctx) => {
  const rawToken = readHeldMagicLink(ctx);

  const followed = await findFollowedInvitation(ctx);
  // Redeemed like opening the link in its own browser, including the refusal while signed in as someone else.
  const tokenRecord = await redeemToken(ctx, { kind: 'magic', rawToken, claimHolder: claimMagicLinkHolder });
  deleteAuthCookie(ctx, 'magic-pending');

  return handleMagicLink(ctx, tokenRecord, followed);
});

export const authMagicLinkHandlers = app;
