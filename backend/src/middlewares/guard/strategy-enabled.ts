import type { Context } from 'hono';
import { appConfig } from 'shared';
import type { BaseAuthStrategies, BaseOAuthProviders } from 'shared/config-builder/types';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';

/**
 * The sign-in method an auth route belongs to: a strategy, or `{ oauth: provider }` for one OAuth provider. A route
 * whose method depends on the request (a token's type) names it per request, `null` when that request has none.
 */
export type StrategyGate =
  | BaseAuthStrategies
  | { oauth: BaseOAuthProviders }
  | ((ctx: Context<Env>) => BaseAuthStrategies | null);

const labelOf = (gate: StrategyGate): string => {
  if (typeof gate === 'function') return 'per-request';
  return typeof gate === 'object' ? gate.oauth : gate;
};

/**
 * First in `xGuard`: the route is refused while its sign-in method is switched off, before any guard runs, so no
 * handler can forget the check. Read per request: the enabled strategies can change at runtime (tests switch them).
 * A route that stays reachable while its method is off (deleting a factor) carries no gate.
 */
export const strategyEnabled = (gate: StrategyGate) => {
  const label = labelOf(gate);
  return xMiddleware(
    {
      functionName: `strategyEnabled(${label})`,
      type: 'x-guard',
      name: `${label} enabled`,
      description:
        typeof gate === 'function'
          ? 'Refused while the sign-in method the request names is switched off'
          : `Refused while ${label} sign-in is switched off`,
    },
    async (ctx, next) => {
      if (typeof gate === 'object') {
        const provider = gate.oauth;
        if (
          !appConfig.enabledAuthStrategies.includes('oauth') ||
          !appConfig.enabledOAuthProviders.some((p) => p === provider)
        ) {
          throw new AppError(400, 'unsupported_oauth', 'error', { meta: { strategy: provider } });
        }
      } else {
        const strategy = typeof gate === 'function' ? gate(ctx) : gate;
        if (strategy && !appConfig.enabledAuthStrategies.includes(strategy)) {
          throw new AppError(400, 'forbidden_strategy', 'error', { meta: { strategy } });
        }
      }
      await next();
    },
  );
};
