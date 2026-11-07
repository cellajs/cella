import { appConfig } from './app-config.ts';
import type { BaseAuthStrategies, BaseOAuthProviders, HasFlagsConfig } from './types.ts';

/**
 * A config switch a route belongs to: a service in `appConfig.services`, a feature flag in `has`, a sign-in method in
 * `enabledAuthStrategies`, or one OAuth provider, which also needs the `oauth` method on. Routes name it in
 * `xEnabledBy`; the API refuses the route while it is off and the docs mark the route as off.
 */
export type ConfigSwitch =
  | { service: keyof typeof appConfig.services }
  | { feature: keyof HasFlagsConfig }
  | { strategy: BaseAuthStrategies; provider?: never }
  | { strategy: 'oauth'; provider: BaseOAuthProviders };

/**
 * Whether a sign-in method is on in this app's config, read per call like `isSwitchOn`. An app's tuple may leave out
 * methods the type lists (a new app has no `sso`), and `includes` on that tuple refuses them, so code asks here.
 */
export const isStrategyEnabled = (strategy: BaseAuthStrategies): boolean => appConfig.enabledAuthStrategies.some((enabled) => enabled === strategy);

/** Whether a switch is on in this app's config, read per call: tests change the config at runtime. */
export const isSwitchOn = (on: ConfigSwitch): boolean => {
  if ('service' in on) return appConfig.services[on.service].enabled;
  if ('feature' in on) return appConfig.has[on.feature];
  if (!isStrategyEnabled(on.strategy)) return false;
  const { provider } = on;
  return !provider || appConfig.enabledOAuthProviders.some((enabled) => enabled === provider);
};
