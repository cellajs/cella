import type { MiddlewareHandler } from 'hono';
import { type ConfigSwitch, isSwitchOn } from 'shared';
import { AppError } from '#/core/error';

/**
 * Refuses a request while its config switch is off: a service answers 404 as if the route did not exist, a
 * sign-in method 400 `forbidden_strategy`, an OAuth provider 400 `unsupported_oauth`.
 */
export const assertSwitchOn = (on: ConfigSwitch): void => {
  if (isSwitchOn(on)) return;
  if ('service' in on) throw new AppError(404, 'route_not_found', 'warn');
  if (on.provider) throw new AppError(400, 'unsupported_oauth', 'error', { meta: { strategy: on.provider } });
  throw new AppError(400, 'forbidden_strategy', 'error', { meta: { strategy: on.strategy } });
};

/** The gate `createXRoute` runs for a route's `xEnabledBy`, before its guards. */
export const configSwitchGate =
  (on: ConfigSwitch): MiddlewareHandler =>
  async (_ctx, next) => {
    assertSwitchOn(on);
    await next();
  };
