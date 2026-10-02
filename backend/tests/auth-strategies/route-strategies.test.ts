import type { ConfigSwitch } from 'shared';
import { describe, expect, it } from 'vitest';
import { authMagicLinkRoutes } from '#/modules/auth/magic/magic-routes';
import { authOAuthRoutes } from '#/modules/auth/oauth/oauth-routes';
import { authPasskeysRoutes } from '#/modules/auth/passkeys/passkeys-routes';
import { authTotpsRoutes } from '#/modules/auth/totps/totps-routes';

/**
 * Every route of a sign-in method names that method as its config switch (`xEnabledBy`), so switching the method off
 * in `appConfig` refuses the route before its guards run. The routes that stay reachable while their method is off
 * (deleting a factor) are listed here; any other route without the switch fails. The magic link route checks its
 * switch per token type, in its handler (enforcement.test.ts).
 */
const strategyRoutes = { totp: authTotpsRoutes, passkey: authPasskeysRoutes, magic: authMagicLinkRoutes, oauth: authOAuthRoutes };
const reachableWhileOff = new Set(['deletePasskey', 'deleteTotp']);

const switchOf = (route: object) => (route as { 'x-enabled-by'?: ConfigSwitch })['x-enabled-by'];

describe('auth routes name their sign-in method as their switch', () => {
  for (const [method, routes] of Object.entries(strategyRoutes)) {
    const switched = Object.entries(routes).filter(([name]) => !reachableWhileOff.has(name));
    it.each(switched)(`${method}: %s is switched by ${method}`, (_name, route) => {
      expect(switchOf(route)).toMatchObject({ strategy: method });
    });
  }

  it('leaves factor deletion reachable while its method is off', () => {
    for (const name of reachableWhileOff) {
      const route = { ...authPasskeysRoutes, ...authTotpsRoutes }[name as 'deletePasskey' | 'deleteTotp'];
      expect(switchOf(route)).toBeUndefined();
    }
  });
});
