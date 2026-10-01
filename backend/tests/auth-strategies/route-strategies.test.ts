import { describe, expect, it } from 'vitest';
import { authGeneralRoutes } from '#/modules/auth/general/general-routes';
import { authMagicLinkRoutes } from '#/modules/auth/magic/magic-routes';
import { authOAuthRoutes } from '#/modules/auth/oauth/oauth-routes';
import { authPasskeysRoutes } from '#/modules/auth/passkeys/passkeys-routes';
import { authTotpsRoutes } from '#/modules/auth/totps/totps-routes';

/**
 * Every route of a sign-in method leads its guard chain with that method's gate, so switching the method off in
 * `appConfig` refuses the route before any handler runs. The routes that stay reachable while their method is off
 * (deleting a factor) are listed here; any other route without the gate fails.
 */
const strategyRoutes = { totp: authTotpsRoutes, passkey: authPasskeysRoutes, magic: authMagicLinkRoutes, oauth: authOAuthRoutes };
const reachableWhileOff = new Set(['deletePasskey', 'deleteTotp']);

const guardsOf = (route: object) => (route as { 'x-guard'?: string[] })['x-guard'] ?? [];

describe('auth routes lead with their sign-in method gate', () => {
  for (const [method, routes] of Object.entries(strategyRoutes)) {
    const gated = Object.entries(routes).filter(([name]) => !reachableWhileOff.has(name));
    it.each(gated)(`${method}: %s is gated first`, (_name, route) => {
      expect(guardsOf(route)[0]).toMatch(/^strategyEnabled\(/);
    });
  }

  it('leaves factor deletion reachable while its method is off', () => {
    for (const name of reachableWhileOff) {
      const route = { ...authPasskeysRoutes, ...authTotpsRoutes }[name as 'deletePasskey' | 'deleteTotp'];
      expect(guardsOf(route).some((guard) => guard.startsWith('strategyEnabled('))).toBe(false);
    }
  });

  it('the token invoke route gates magic links per request', () => {
    expect(guardsOf(authGeneralRoutes.invokeToken)[0]).toBe('strategyEnabled(per-request)');
  });
});
