import { type ConfigSwitch, isSwitchOn } from 'shared';
import { AppError } from '#/core/error';
import type { XMiddlewareHandler } from '#/core/openapi-extensions';
import { xMiddleware } from '#/core/x-middleware';

/**
 * Refuses a request while its config switch is off: a service, a feature flag or a product answers 404 as if the route
 * did not exist, a sign-in method 400 `forbidden_strategy`, an OAuth provider 400 `unsupported_oauth`.
 */
export const assertSwitchOn = (on: ConfigSwitch): void => {
  if (isSwitchOn(on)) return;
  if (!('strategy' in on)) throw new AppError(404, 'route_not_found', 'warn');
  if (on.provider) throw new AppError(400, 'unsupported_oauth', 'warn', { meta: { strategy: on.provider } });
  throw new AppError(400, 'forbidden_strategy', 'warn', { meta: { strategy: on.strategy } });
};

/** The gate `createXRoute` runs for a route's `xEnabledBy`, before its guards; it declares the status `assertSwitchOn` answers. */
export const configSwitchGate = (on: ConfigSwitch): XMiddlewareHandler =>
  xMiddleware({ functionName: 'xEnabledBy', type: 'x-enabled-by', errors: ['strategy' in on ? 400 : 404] }, async (_ctx, next) => {
    assertSwitchOn(on);
    await next();
  });
