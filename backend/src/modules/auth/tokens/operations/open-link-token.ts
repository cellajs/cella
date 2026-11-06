import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { assertSwitchOn } from '#/middlewares/config-switch';
import { findFollowedInvitation } from '#/modules/auth/invitations/operations/accept-followed-invitation';
import { handleMagicLink } from '#/modules/auth/magic/operations/handle-magic-link';
import { explainOpenedMagicLink, holdMagicLinkOutsideItsBrowser } from '#/modules/auth/magic/operations/magic-link-browser';
import { claimMagicLinkHolder } from '#/modules/auth/magic/operations/magic-sign-up';
import { oauthVerificationUrl } from '#/modules/auth/oauth/operations/handle-oauth-verification';
import { findSession } from '#/modules/auth/sessions/operations/resolve-session';
import { forgetLinkRequest, holdLinkToken, invokeToken, redeemHeldLink } from '#/modules/auth/tokens/token-lifecycle';
import type { HeldLinkType, LinkTokenType } from '#/modules/auth/tokens/token-policies';
import type { TokenRecord } from '#/modules/auth/tokens/tokens-queries';
import { log } from '#/utils/logger';

/** Answers a click on an emailed link, from the raw value in its URL. */
type LinkHandler = (ctx: Context<Env>, rawToken: string) => Promise<Response>;

/**
 * Where a redeemed invitation or verification link sends the browser: the same for the GET of a link this browser
 * redeemed before and for the POST that redeems a held one.
 */
const redeemedLinkTargets = {
  'oauth-verification': oauthVerificationUrl,
  invitation: async (token) => {
    log.info('Token invoked, redirecting with single use token in cookie', { tokenId: token.id, userId: token.userId });
    return `${appConfig.frontendUrl}/auth/authenticate?tokenId=${token.id}`;
  },
} satisfies Record<HeldLinkType, (token: TokenRecord) => Promise<string>>;

/** An accepted invitation takes its link with it, so a member who opens the mail again goes to the app. */
const appOnceAccepted = async (ctx: Context<Env>, err: unknown): Promise<string> => {
  if (err instanceof AppError && err.type === 'invitation_not_found' && (await findSession(ctx))) {
    return `${appConfig.frontendUrl}${appConfig.defaultRedirectPath}`;
  }
  throw err;
};

/** Holds an invitation or verification link for its confirm page, or goes on with one this browser redeemed before. */
const holdLink = async (ctx: Context<Env>, type: HeldLinkType, rawToken: string) => {
  const target = await holdLinkToken(ctx, type, rawToken)
    .then((redeemed) => (redeemed ? redeemedLinkTargets[type](redeemed) : `${appConfig.frontendUrl}/auth/confirm-link/${type}`))
    .catch((err) => appOnceAccepted(ctx, err));
  return ctx.redirect(target, 302);
};

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
  'oauth-verification': (ctx, rawToken) => holdLink(ctx, 'oauth-verification', rawToken),
  invitation: (ctx, rawToken) => holdLink(ctx, 'invitation', rawToken),
} satisfies Record<LinkTokenType, LinkHandler>;

/** Opens an emailed link of `type` from the raw value in its URL, by what that type's link does. */
export const openLinkToken = (ctx: Context<Env>, type: LinkTokenType, rawToken: string) => linkHandlers[type](ctx, rawToken);

/**
 * Redeems the invitation or verification link this browser holds, on the POST from its confirm page.
 * @returns Where the browser goes next, which the page follows with a navigation of its own: a verification goes on to
 *   the provider, which a form post's redirect could not reach under the page's `form-action 'self'`.
 */
export const confirmHeldLink = async (ctx: Context<Env>, type: HeldLinkType): Promise<string> => {
  try {
    return await redeemedLinkTargets[type](await redeemHeldLink(ctx, type));
  } catch (err) {
    return appOnceAccepted(ctx, err);
  }
};
