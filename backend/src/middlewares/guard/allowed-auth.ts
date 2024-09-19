import { config } from 'config';
import type { MiddlewareHandler } from 'hono';
import { errorResponse } from '#/lib/errors';
import type { AllowedAuthStrategies, EnabledOauthProviderOptions, OauthProviderOptions } from '#/types/common';

type AuthStrategies = (typeof supportedAuthStrategies)[number];

export const supportedOauthProviders = ['github', 'google', 'microsoft'] as const;
export const supportedAuthStrategies = ['oauth', 'password', 'passkey'] as const;

export const isAllowedOAuth =
  (provider: OauthProviderOptions): MiddlewareHandler =>
  async (ctx, next) => {
    // Verify if provider is enabled as an OAuth option
    if (!config.enabledOauthProviders.includes(provider as EnabledOauthProviderOptions)) {
      return errorResponse(ctx, 400, 'Unsupported oauth', 'warn', undefined, { strategy: provider });
    }

    await next();
  };

export const isAllowedAuthStrategy =
  (strategy: AuthStrategies): MiddlewareHandler =>
  async (ctx, next) => {
    // Verify if strategy allowed
    if (!config.enabledAuthenticationStrategies.includes(strategy as AllowedAuthStrategies)) {
      return errorResponse(ctx, 400, `Unallowed auth strategy: ${strategy}`, 'warn', undefined, { strategy });
    }
    await next();
  };
