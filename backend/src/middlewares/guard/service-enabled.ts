import { appConfig } from 'shared';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';

/** A service that can be switched off in `appConfig.services`. */
export type GatedService = keyof typeof appConfig.services;

/**
 * First in `xGuard`: the route answers 404 while its service is switched off, before any guard can show how it
 * authenticates. Read per request.
 */
export const serviceEnabled = (service: GatedService) =>
  xMiddleware(
    {
      functionName: `serviceEnabled(${service})`,
      type: 'x-guard',
      name: `${service} enabled`,
      description: `Answers 404 while the ${service} service is switched off`,
    },
    async (_ctx, next) => {
      if (appConfig.services[service]?.enabled === false) throw new AppError(404, 'route_not_found', 'warn');
      await next();
    },
  );
