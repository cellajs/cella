import type { MiddlewareHandler } from 'hono';
import type { Env } from '#/lib/context';
import type { MiddlewareArray } from '../types';

/** Normalize middleware (single or array) to array */
export const toMiddlewareArray = <E extends Env = Env>(mw?: MiddlewareArray<E>): MiddlewareHandler<E>[] => {
  if (!mw) return [];
  if (Array.isArray(mw)) return [...mw] as MiddlewareHandler<E>[];
  return [mw as MiddlewareHandler<E>];
};
