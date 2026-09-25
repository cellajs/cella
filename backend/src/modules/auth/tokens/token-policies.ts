import type { TokenType } from 'shared';
import { TimeSpan } from '#/utils/time-span';

type SameSite = 'lax' | 'strict';

/**
 * The lifecycle rules of one token type. A `link` token travels in an emailed URL: redeeming it (`invokeToken`) swaps
 * its lifetime for the single-use window and binds it to the browser with a single-use cookie. A `cookie` token lives
 * only in a cookie of its own name and is never redeemable as a link.
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
    };

/**
 * One policy per token type; an app that adds a token type to `appConfig.tokenTypes` must add its policy here.
 * - `invitation`: its single-use window outlasts a magic-link sign-in (15 minutes) plus a second-factor challenge, so
 *   answering an invitation from another account never expires midway.
 * - `invitation` and `oauth-verification` are Lax: an OAuth provider's callback, a navigation another site started,
 *   reads them. The others are Strict.
 */
export const tokenPolicies = {
  invitation: { carrier: 'link', ttl: new TimeSpan(7, 'd'), singleUseWindow: new TimeSpan(30, 'm'), sameSite: 'lax' },
  magic: { carrier: 'link', ttl: new TimeSpan(15, 'm'), singleUseWindow: new TimeSpan(5, 'm'), sameSite: 'strict' },
  'oauth-verification': {
    carrier: 'link',
    ttl: new TimeSpan(2, 'h'),
    singleUseWindow: new TimeSpan(5, 'm'),
    sameSite: 'lax',
  },
  'confirm-mfa': { carrier: 'cookie', ttl: new TimeSpan(10, 'm'), sameSite: 'strict' },
} as const satisfies Record<TokenType, TokenPolicy>;

type TokenTypeCarriedBy<C extends TokenPolicy['carrier']> = {
  [T in TokenType]: (typeof tokenPolicies)[T]['carrier'] extends C ? T : never;
}[TokenType];

/** Token types carried by an emailed link. */
export type LinkTokenType = TokenTypeCarriedBy<'link'>;

/** Token types carried only by a cookie. */
export type CookieTokenType = TokenTypeCarriedBy<'cookie'>;

/** Whether a cookie name is a token type's own cookie, so its policy decides the cookie's attributes. */
export const isTokenType = (name: string): name is TokenType => Object.hasOwn(tokenPolicies, name);
