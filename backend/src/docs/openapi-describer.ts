import type { MiddlewareHandler } from 'hono';
import { createSpecificationExtensions } from '#/docs/openapi-extensions';
import type { SpecificationExtensions, XMiddlewareHandler } from '#/docs/types';

export type { SpecificationExtensions };

// Type guard to check if a middleware has extension type
const isXMiddleware = (mw: MiddlewareHandler): mw is XMiddlewareHandler => {
  return '__extensionType' in mw && typeof (mw as XMiddlewareHandler).__extensionType === 'string';
};

/**
 * Returns specification extensions by reading directly from middleware properties.
 *
 * @param middlewares - Array of MiddlewareHandler to extract extensions from.
 * @returns SpecificationExtensions object.
 */
export function getSpecificationExtensions(middlewares: MiddlewareHandler[]): SpecificationExtensions {
  const xMiddlewares = middlewares.filter(isXMiddleware);

  return createSpecificationExtensions((key) =>
    xMiddlewares.filter((mw) => mw.__extensionType === key && mw.name).map((mw) => mw.name),
  );
}
