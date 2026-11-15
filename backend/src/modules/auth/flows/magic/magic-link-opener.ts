import { assertSwitchOn } from '#/middlewares/config-switch';
import { findFollowedInvitation } from '#/modules/auth/core/invitations/operations/accept-followed-invitation';
import { registerLinkHandler } from '#/modules/auth/core/tokens/operations/open-link-token';
import { forgetMagicLinkRequest, redeemToken } from '#/modules/auth/core/tokens/token-lifecycle';
import { handleMagicLink } from '#/modules/auth/flows/magic/operations/handle-magic-link';
import { holdMagicLinkOutsideItsBrowser } from '#/modules/auth/flows/magic/operations/magic-link-browser';
import { claimMagicLinkHolder } from '#/modules/auth/flows/magic/operations/magic-sign-up';

// What opening a magic link does, registered when the magic handlers load. Only a magic link belongs to a sign-in
// method, so the method's switch is checked here, per token kind.
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
