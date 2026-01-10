import type { MiddlewareHandler } from 'hono';
import type { ExtensionType, XMiddlewareHandler } from '#/lib/x-middleware';

export type SpecificationExtensions = Record<ExtensionType, string[]>;

/** Type guard to check if a middleware has extension type */
const isXMiddleware = (mw: MiddlewareHandler): mw is XMiddlewareHandler => {
  return '__extensionType' in mw && typeof (mw as XMiddlewareHandler).__extensionType === 'string';
};

/** Returns x-guard and x-rate-limiter extensions by reading directly from middleware properties. */
export function getSpecificationExtensions(middlewares: MiddlewareHandler[]): SpecificationExtensions {
  const xMiddlewares = middlewares.filter(isXMiddleware);

  return {
    'x-guard': xMiddlewares.filter((mw) => mw.__extensionType === 'x-guard' && mw.name).map((mw) => mw.name),
    'x-rate-limiter': xMiddlewares
      .filter((mw) => mw.__extensionType === 'x-rate-limiter' && mw.name)
      .map((mw) => mw.name),
  };
}
