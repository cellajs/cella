import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { assertSwitchOn } from '#/middlewares/config-switch';
import { findFollowedInvitation } from '#/modules/auth/invitations/operations/accept-followed-invitation';
import { handleMagicLink } from '#/modules/auth/magic/operations/handle-magic-link';
import { explainOpenedMagicLink, holdMagicLinkOutsideItsBrowser } from '#/modules/auth/magic/operations/magic-link-browser';
import { claimMagicLinkHolder } from '#/modules/auth/magic/operations/magic-sign-up';
import { handleOAuthVerification } from '#/modules/auth/oauth/operations/handle-oauth-verification';
import { findSession } from '#/modules/auth/sessions/operations/resolve-session';
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

    const followed = await findFollowedInvitation(ctx);
    // A sign-up link creates its account at this click, which proves the inbox.
    const token = await invokeToken(ctx, { type: 'magic', rawToken, claimHolder: claimMagicLinkHolder }).catch((err) =>
      explainOpenedMagicLink(err, rawToken),
    );
    forgetLinkRequest(ctx, 'magic');
    return handleMagicLink(ctx, token, followed);
  },
  'oauth-verification': async (ctx, rawToken) => handleOAuthVerification(ctx, await invokeToken(ctx, { type: 'oauth-verification', rawToken })),
  invitation: async (ctx, rawToken) => {
    // An accepted invitation takes its link with it, so a member who opens the mail again goes to the app.
    const token = await invokeToken(ctx, { type: 'invitation', rawToken }).catch(async (err) => {
      if (err instanceof AppError && err.type === 'invitation_not_found' && (await findSession(ctx))) return null;
      throw err;
    });
    if (!token) return ctx.redirect(`${appConfig.frontendUrl}${appConfig.defaultRedirectPath}`, 302);
    log.info('Token invoked, redirecting with single use token in cookie', { tokenId: token.id, userId: token.userId });
    return ctx.redirect(`${appConfig.frontendUrl}/auth/authenticate?tokenId=${token.id}`, 302);
  },
} satisfies Record<LinkTokenType, LinkHandler>;

/** Opens an emailed link of `type` from the raw value in its URL, by what that type's link does. */
export const openLinkToken = (ctx: Context<Env>, type: LinkTokenType, rawToken: string) => linkHandlers[type](ctx, rawToken);
