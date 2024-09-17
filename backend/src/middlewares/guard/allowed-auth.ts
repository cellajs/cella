import { config } from 'config';
import type { Context, MiddlewareHandler } from 'hono';
import { errorResponse } from '#/lib/errors';
import type { Env } from '#/types/app';
import type { AllowedAuthStrategies, EnabledOauthProviderOptions, OauthProviderOptions } from '#/types/common';

type AuthStrategies = (typeof supportedAuthStrategies)[number];

export const supportedOauthProviders = ['github', 'google', 'microsoft'] as const;
export const supportedAuthStrategies = ['oauth', 'password', 'passkey'] as const;

export const isAllowedOAuth =
  // biome-ignore lint/suspicious/noExplicitAny: it's required to use `any` here
    (provider: OauthProviderOptions): MiddlewareHandler<Env, any> =>
    async (ctx: Context, next) => {
      // Verify if provider is enabled as an OAuth option
      if (!config.enabledOauthProviders.includes(provider as EnabledOauthProviderOptions)) {
        return errorResponse(ctx, 400, 'Unsupported oauth', 'warn', undefined, { strategy: provider });
      }

      await next();
    };

export const isAllowedAuthStrategy =
  // biome-ignore lint/suspicious/noExplicitAny: it's required to use `any` here
    (strategy: AuthStrategies): MiddlewareHandler<Env, any> =>
    async (ctx: Context, next) => {
      // Verify if strategy allowed
      if (!config.enabledAuthenticationStrategies.includes(strategy as AllowedAuthStrategies)) {
        return errorResponse(ctx, 400, `Unallowed auth strategy: ${strategy}`, 'warn', undefined, { strategy });
      }
      await next();
    };
