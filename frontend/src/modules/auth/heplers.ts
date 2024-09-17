import { config } from 'config';
import type { AllowedAuthStrategies, EnabledOauthProviderOptions } from '#/types/common';

// Type guard to ensure `id` matches `EnabledOauthProviderOptions`
export const isEnabledOauthProvider = (id: string): id is EnabledOauthProviderOptions => {
  return config.enabledOauthProviders.includes(id as EnabledOauthProviderOptions);
};

export const isEnabledAuthStrategy = (strategy: string) => {
  return config.enabledAuthenticationStrategies.includes(strategy as AllowedAuthStrategies);
};
