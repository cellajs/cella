import { describe, expect, it } from 'vitest';
import { authGeneralRoutes } from '#/modules/auth/general/general-routes';
import { authMagicLinkRoutes } from '#/modules/auth/magic/magic-routes';
import { authOAuthRoutes } from '#/modules/auth/oauth/oauth-routes';
import { authPasskeysRoutes } from '#/modules/auth/passkeys/passkeys-routes';
import { authTotpsRoutes } from '#/modules/auth/totps/totps-routes';

/**
 * Every route of a sign-in method declares its strategy, so switching the method off in `appConfig` refuses the route
 * before any handler runs. A route that stays reachable while its method is off (deleting a factor) says so with
 * `null` (`none` in the spec); an undeclared route fails here.
 */
const strategyRoutes = {
  totp: authTotpsRoutes,
  passkey: authPasskeysRoutes,
  magic: authMagicLinkRoutes,
  oauth: authOAuthRoutes,
};

describe('auth routes declare their sign-in method', () => {
  for (const [method, routes] of Object.entries(strategyRoutes)) {
    it.each(Object.entries(routes))(`${method}: %s declares x-strategy`, (_name, route) => {
      expect(route).toHaveProperty('x-strategy');
    });
  }

  it('the token invoke route gates magic links per request', () => {
    expect(authGeneralRoutes.invokeToken).toHaveProperty('x-strategy', 'per-request');
  });
});
