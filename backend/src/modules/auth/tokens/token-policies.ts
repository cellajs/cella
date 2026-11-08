import { appConfig, type TokenKind } from 'shared';
import { TimeSpan } from '#/utils/time-span';

type SameSite = 'lax' | 'strict';

/**
 * The lifecycle rules of one token kind. A `link` token travels in an emailed URL: redeeming it (`invokeToken`) swaps
 * its lifetime for the single-use window and binds it to the browser with a single-use cookie. A `cookie` token lives
 * only in a cookie of its own name and is never redeemable as a link. A `code` token is a short number in a mail,
 * entered in the session it was issued for: it is found by that session, never by its value.
 */
export type TokenPolicy =
  | {
      carrier: 'link';
      /** Lifetime from issue until the link is redeemed. */
      ttl: TimeSpan;
      /** How long a redeemed link stays usable through its single-use cookie. */
      singleUseWindow: TimeSpan;
      /** SameSite of the single-use cookie; `lax` when a navigation from another site must carry it. */
      sameSite: SameSite;
    }
  | {
      carrier: 'cookie';
      /** Lifetime of the token and of the cookie that carries it. */
      ttl: TimeSpan;
      sameSite: SameSite;
    }
  | { carrier: 'code'; ttl: TimeSpan };

/**
 * One policy per token kind; an app that adds a token kind to `appConfig.tokenKinds` must add its policy here, its
 * replacement subject in `replacementSubjects` (`tokens-queries.ts`), and a link kind also what opening it does
 * (`operations/open-link-token.ts`).
 * - `invitation`: its single-use window outlasts a magic-link sign-in (15 minutes) plus a second-factor challenge, so
 *   answering an invitation from another account never expires midway.
 * - `invitation`, `oauth-verification` and `oauth-connect` are Lax: an OAuth provider's callback, a navigation another
 *   site started, reads them. The others are Strict.
 * - `oauth-connect` pins a connect to the account that started it, in this browser, for the provider round trip.
 */
export const tokenPolicies = {
  invitation: { carrier: 'link', ttl: new TimeSpan(7, 'd'), singleUseWindow: new TimeSpan(30, 'm'), sameSite: 'lax' },
  magic: { carrier: 'link', ttl: new TimeSpan(15, 'm'), singleUseWindow: new TimeSpan(5, 'm'), sameSite: 'strict' },
  'oauth-verification': { carrier: 'link', ttl: new TimeSpan(2, 'h'), singleUseWindow: new TimeSpan(5, 'm'), sameSite: 'lax' },
  'confirm-mfa': { carrier: 'cookie', ttl: new TimeSpan(10, 'm'), sameSite: 'strict' },
  'oauth-connect': { carrier: 'cookie', ttl: new TimeSpan(10, 'm'), sameSite: 'lax' },
  'step-up': { carrier: 'code', ttl: new TimeSpan(10, 'm') },
} as const satisfies Record<TokenKind, TokenPolicy>;

type TokenKindCarriedBy<C extends TokenPolicy['carrier']> = {
  [T in TokenKind]: (typeof tokenPolicies)[T]['carrier'] extends C ? T : never;
}[TokenKind];

/** Token kinds carried by an emailed link. */
export type LinkTokenKind = TokenKindCarriedBy<'link'>;

/**
 * The emailed URL that opens a link token. Keep the `/invoke-token/` path: `middlewares/app.ts` answers it with
 * `Referrer-Policy: no-referrer`, so the secret in it never leaks through a Referer.
 */
export const tokenLinkUrl = (kind: LinkTokenKind, rawToken: string) => `${appConfig.backendAuthUrl}/invoke-token/${kind}/${rawToken}`;

/**
 * Link kinds a GET only holds, for a POST from the app's page to redeem. A magic link signs in on the GET in the browser
 * that asked for it, and holds itself everywhere else (`holdMagicLinkOutsideItsBrowser`).
 */
export type HeldLinkKind = Exclude<LinkTokenKind, 'magic'>;

/** Token kinds carried only by a cookie. */
export type CookieTokenKind = TokenKindCarriedBy<'cookie'>;

/** Token kinds carried by an emailed code. */
export type CodeTokenKind = TokenKindCarriedBy<'code'>;

const isLinkTokenKind = (kind: TokenKind): kind is LinkTokenKind => tokenPolicies[kind].carrier === 'link';

/** Every token kind carried by an emailed link: the kinds a link can open. */
export const linkTokenKinds = appConfig.tokenKinds.filter(isLinkTokenKind);

const isHeldLinkKind = (kind: LinkTokenKind): kind is HeldLinkKind => kind !== 'magic';

/** Every link kind a GET only holds. */
export const heldLinkKinds = linkTokenKinds.filter(isHeldLinkKind);

/** Whether a cookie name is a token kind's own cookie, so its policy decides the cookie's attributes. */
export const isTokenKind = (name: string): name is TokenKind => Object.hasOwn(tokenPolicies, name);
