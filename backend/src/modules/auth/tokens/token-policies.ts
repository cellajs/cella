import { appConfig, type TokenType } from 'shared';
import { TimeSpan } from '#/utils/time-span';

type SameSite = 'lax' | 'strict';

/**
 * Which earlier tokens of its type a new token deletes, so only the newest one for its subject works:
 * - `address-or-account`: those for its address, and for its account when it names one (a magic link).
 * - `identity`: those of its identity, or of the provider account signing up (a verification link).
 * - `invitation`: those of its membership invitation, or of its address for a system invitation.
 * - `account`: those of its account (a connect pin: one per account at a time).
 * - `session`: those bound to its session (a step-up link: one per session at a time).
 * - `none`: nothing; each one stands on its own (every sign-in holds its own second-factor challenge).
 */
export const tokenReplacements = [
  'address-or-account',
  'identity',
  'invitation',
  'account',
  'session',
  'none',
] as const;
export type TokenReplacement = (typeof tokenReplacements)[number];

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
      replaces: TokenReplacement;
      /**
       * Who a link issued without an account belongs to when a signed-in browser opens it: `address-owner`, the
       * account holding its address by now (a new account when nobody does); `any-account`, whoever is signed in, as
       * their own account (an invitation not yet bound to a user).
       */
      unboundOpener: 'address-owner' | 'any-account';
    }
  | {
      carrier: 'cookie';
      /** Lifetime of the token and of the cookie that carries it. */
      ttl: TimeSpan;
      sameSite: SameSite;
      replaces: TokenReplacement;
    };

/**
 * One policy per token type; an app that adds a token type to `appConfig.tokenTypes` must add its policy here, and a
 * link type also its handler in `linkHandlers`.
 * - `invitation`: its single-use window outlasts a magic-link sign-in (15 minutes) plus a second-factor challenge, so
 *   answering an invitation from another account never expires midway.
 * - `invitation`, `oauth-verification` and `oauth-connect` are Lax: an OAuth provider's callback, a navigation another
 *   site started, reads them. The others are Strict.
 * - `oauth-connect` pins a connect to the account that started it, in this browser, for the provider round trip.
 * - `step-up` confirms, from the inbox, a step-up of the session that asked for it; see `openStepUpLink`.
 */
export const tokenPolicies = {
  invitation: {
    carrier: 'link',
    ttl: new TimeSpan(7, 'd'),
    singleUseWindow: new TimeSpan(30, 'm'),
    sameSite: 'lax',
    replaces: 'invitation',
    unboundOpener: 'any-account',
  },
  magic: {
    carrier: 'link',
    ttl: new TimeSpan(15, 'm'),
    singleUseWindow: new TimeSpan(5, 'm'),
    sameSite: 'strict',
    replaces: 'address-or-account',
    unboundOpener: 'address-owner',
  },
  'oauth-verification': {
    carrier: 'link',
    ttl: new TimeSpan(2, 'h'),
    singleUseWindow: new TimeSpan(5, 'm'),
    sameSite: 'lax',
    replaces: 'identity',
    unboundOpener: 'address-owner',
  },
  'confirm-mfa': { carrier: 'cookie', ttl: new TimeSpan(10, 'm'), sameSite: 'strict', replaces: 'none' },
  'oauth-connect': { carrier: 'cookie', ttl: new TimeSpan(10, 'm'), sameSite: 'lax', replaces: 'account' },
  'step-up': {
    carrier: 'link',
    ttl: new TimeSpan(10, 'm'),
    singleUseWindow: new TimeSpan(5, 'm'),
    sameSite: 'strict',
    replaces: 'session',
    unboundOpener: 'address-owner',
  },
} as const satisfies Record<TokenType, TokenPolicy>;

type TokenTypeCarriedBy<C extends TokenPolicy['carrier']> = {
  [T in TokenType]: (typeof tokenPolicies)[T]['carrier'] extends C ? T : never;
}[TokenType];

/** Token types carried by an emailed link. */
export type LinkTokenType = TokenTypeCarriedBy<'link'>;

/** Token types carried only by a cookie. */
export type CookieTokenType = TokenTypeCarriedBy<'cookie'>;

const isLinkTokenType = (type: TokenType): type is LinkTokenType => tokenPolicies[type].carrier === 'link';

/** Every token type carried by an emailed link: the types a link can open. */
export const linkTokenTypes = appConfig.tokenTypes.filter(isLinkTokenType);

/** Whether a cookie name is a token type's own cookie, so its policy decides the cookie's attributes. */
export const isTokenType = (name: string): name is TokenType => Object.hasOwn(tokenPolicies, name);
