import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { findSession } from '#/modules/auth/core/sessions/operations/resolve-session';
import { holdLinkToken, redeemHeldLink } from '#/modules/auth/core/tokens/token-lifecycle';
import type { HeldLinkKind, LinkTokenKind } from '#/modules/auth/core/tokens/token-policies';
import type { TokenRecord } from '#/modules/auth/core/tokens/tokens-queries';
import { log } from '#/utils/logger';

/** Answers a click on an emailed link, from the raw value in its URL. */
type LinkHandler = (ctx: Context<Env>, rawToken: string) => Promise<Response>;

/**
 * Where a redeemed held link sends the browser: the same for the GET of a link this browser redeemed before and for the
 * POST that redeems a held one.
 */
type RedeemedLinkTarget = (token: TokenRecord) => Promise<string>;

/**
 * What opening each link kind does. The engine knows the invitation link, its own. A sign-in flow registers its link
 * kinds when its handlers load: the engine imports no flow, and an app without that flow has no such link. A kind
 * nothing registered answers a server error; `backend/tests/auth-boundary.test.ts` holds every link kind to one handler.
 */
const linkHandlers = new Map<LinkTokenKind, LinkHandler>();
const redeemedLinkTargets = new Map<HeldLinkKind, RedeemedLinkTarget>();

const unregistered = (kind: string) => new AppError(500, 'server_error', 'error', { meta: { kind } });

/** Registers what opening a link of `kind` does. */
export const registerLinkHandler = (kind: LinkTokenKind, handler: LinkHandler): void => {
  linkHandlers.set(kind, handler);
};

/**
 * Registers a link of `kind` that is held for its confirm page and, once redeemed, sends the browser to `target`: what
 * an invitation or verification link does.
 */
export const registerHeldLink = (kind: HeldLinkKind, target: RedeemedLinkTarget): void => {
  redeemedLinkTargets.set(kind, target);
  registerLinkHandler(kind, (ctx, rawToken) => holdLink(ctx, kind, rawToken));
};

/** The link kinds with a handler, for the test that holds them to every link kind. */
export const registeredLinkKinds = (): LinkTokenKind[] => [...linkHandlers.keys()];

const redeemedTarget = (kind: HeldLinkKind): RedeemedLinkTarget => {
  const target = redeemedLinkTargets.get(kind);
  if (!target) throw unregistered(kind);
  return target;
};

/** An accepted invitation takes its link with it: a member who opens the mail again goes to the app. */
const appOnceAccepted = async (ctx: Context<Env>, err: unknown): Promise<string> => {
  if (err instanceof AppError && err.type === 'invitation_not_found' && (await findSession(ctx))) {
    return `${appConfig.frontendUrl}${appConfig.defaultRedirectPath}`;
  }
  throw err;
};

/** Holds an invitation or verification link for its confirm page, or goes on with one this browser redeemed before. */
const holdLink = async (ctx: Context<Env>, kind: HeldLinkKind, rawToken: string) => {
  const target = await holdLinkToken(ctx, kind, rawToken)
    .then((redeemed) => (redeemed ? redeemedTarget(kind)(redeemed) : `${appConfig.frontendUrl}/auth/confirm-link/${kind}`))
    .catch((err) => appOnceAccepted(ctx, err));
  return ctx.redirect(target, 302);
};

// A redeemed invitation link opens the sign-in page on its confirm step.
registerHeldLink('invitation', async (token) => {
  log.info('Token redeemed, redirecting with single use token in cookie', { tokenId: token.id, userId: token.userId });
  return `${appConfig.frontendUrl}/auth/authenticate?tokenId=${token.id}`;
});

/** Opens an emailed link of `kind` from the raw value in its URL, by what that kind's link does. */
export const openLinkToken = (ctx: Context<Env>, kind: LinkTokenKind, rawToken: string) => {
  const handler = linkHandlers.get(kind);
  if (!handler) throw unregistered(kind);
  return handler(ctx, rawToken);
};

/**
 * Redeems the invitation or verification link this browser holds, on the POST from its confirm page.
 * @returns Where the browser goes next, which the page follows with a navigation of its own: a verification goes on to
 *   the provider, which a form post's redirect could not reach under the page's `form-action 'self'`.
 */
export const confirmHeldLink = async (ctx: Context<Env>, kind: HeldLinkKind): Promise<string> => {
  try {
    return await redeemedTarget(kind)(await redeemHeldLink(ctx, kind));
  } catch (err) {
    return appOnceAccepted(ctx, err);
  }
};
