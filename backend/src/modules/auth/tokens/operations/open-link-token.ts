import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { assertSwitchOn } from '#/middlewares/config-switch';
import { handleMagicLink } from '#/modules/auth/magic/operations/handle-magic';
import { explainOpenedMagicLink, holdMagicLinkOutsideItsBrowser } from '#/modules/auth/magic/operations/magic-link-browser';
import { claimMagicLinkOwner } from '#/modules/auth/magic/operations/magic-sign-up';
import { handleOAuthVerification } from '#/modules/auth/oauth/operations/handle-oauth-verification';
import { openStepUpLink } from '#/modules/auth/step-up/operations/open-step-up-link';
import { forgetLinkRequest, invokeToken } from '#/modules/auth/tokens/token-lifecycle';
import type { LinkTokenType } from '#/modules/auth/tokens/token-policies';
import { log } from '#/utils/logger';

/** Answers a click on an emailed link, from the raw value in its URL. */
type LinkHandler = (ctx: Context<Env>, rawToken: string) => Promise<Response>;

/**
 * What opening each link token type does, keyed by every link type: a type added with a link policy does not compile
 * until it says what its link does, so no link falls through to another type's handling.
 */
const linkHandlers = {
  // Only a magic link belongs to a sign-in method, so this route's switch is checked here, per token type.
  magic: async (ctx, rawToken) => {
    assertSwitchOn({ strategy: 'magic' });
    const held = await holdMagicLinkOutsideItsBrowser(ctx, rawToken);
    if (held) return held;

    // A sign-up link creates its account at this click, which proves the inbox.
    const token = await invokeToken(ctx, { type: 'magic', rawToken, claimOwner: claimMagicLinkOwner }).catch((err) =>
      explainOpenedMagicLink(err, rawToken),
    );
    forgetLinkRequest(ctx, 'magic');
    return handleMagicLink(ctx, token);
  },
  'oauth-verification': async (ctx, rawToken) => handleOAuthVerification(ctx, await invokeToken(ctx, { type: 'oauth-verification', rawToken })),
  invitation: async (ctx, rawToken) => {
    const token = await invokeToken(ctx, { type: 'invitation', rawToken });
    log.info('Token invoked, redirecting with single use token in cookie', { tokenId: token.id, userId: token.userId });
    return ctx.redirect(`${appConfig.frontendUrl}/auth/authenticate?tokenId=${token.id}`, 302);
  },
  'step-up': openStepUpLink,
} satisfies Record<LinkTokenType, LinkHandler>;

/** Opens an emailed link of `type` from the raw value in its URL, by what that type's link does. */
export const openLinkToken = (ctx: Context<Env>, type: LinkTokenType, rawToken: string) => linkHandlers[type](ctx, rawToken);
