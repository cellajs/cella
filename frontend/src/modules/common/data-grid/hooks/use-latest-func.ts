import { useLatestCallback } from '~/hooks/use-latest-ref';
import type { Maybe } from '../types';

/**
 * Returns a stable callback that always calls the latest function.
 * Delegates to centralized useLatestCallback hook.
 * @deprecated Use useLatestCallback from '~/hooks/use-latest-ref' directly
 */
// biome-ignore lint/suspicious/noExplicitAny: function signature compatibility
export function useLatestFunc<T extends Maybe<(...args: any[]) => any>>(fn: T): T {
  return useLatestCallback(fn);
}
