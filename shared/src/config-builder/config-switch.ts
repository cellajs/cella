import { appConfig } from './app-config.ts';
import type { BaseAuthStrategies, BaseOAuthProviders } from './types.ts';

/**
 * A config switch a route belongs to: a service in `appConfig.services`, a sign-in method in
 * `enabledAuthStrategies`, or one OAuth provider, which also needs the `oauth` method on. Routes name it in
 * `xEnabledBy`; the API refuses the route while it is off and the docs mark the route as off.
 */
export type ConfigSwitch =
  | { service: keyof typeof appConfig.services }
  | { strategy: BaseAuthStrategies; provider?: never }
  | { strategy: 'oauth'; provider: BaseOAuthProviders };

/** Whether a switch is on in this app's config, read per call: tests change the config at runtime. */
export const isSwitchOn = (on: ConfigSwitch): boolean => {
  if ('service' in on) return appConfig.services[on.service]?.enabled !== false;
  if (!appConfig.enabledAuthStrategies.includes(on.strategy)) return false;
  const { provider } = on;
  return !provider || appConfig.enabledOAuthProviders.some((enabled) => enabled === provider);
};
