import { appConfig, type ContextEntityType } from 'config';
import type { ContextEntityBase, UserBase } from '~/api.gen';
import { flattenCachedToArray, useQueryCacheSelector, WithIdSlug } from './helpers';

const contextEntityTypesConst = appConfig.contextEntityTypes as readonly ContextEntityType[];

function isContextEntityType(t: ContextEntityType | 'user'): t is ContextEntityType {
  return (contextEntityTypesConst as readonly string[]).includes(t);
}

// overloads stay the same
export function useCachedEntityItem(args: { idOrSlug: string; entityType: ContextEntityType | 'user' }): UserBase | undefined;
export function useCachedEntityItem<T extends ContextEntityType>(args: { idOrSlug: string; entityType: T }): ContextEntityBase | undefined;

export function useCachedEntityItem(args: { idOrSlug: string; entityType: ContextEntityType | 'user' }) {
  const { idOrSlug, entityType } = args;

  return useQueryCacheSelector(
    (qc) => {
      const isContext = isContextEntityType(entityType);
      const queryKey = isContext ? [entityType] : []; // adjust if you have a user prefix

      const match = (x: WithIdSlug) => x?.id === idOrSlug || x?.slug === idOrSlug;

      const queries = qc.getQueriesData({ queryKey });

      for (const [, cached] of queries) {
        const all = flattenCachedToArray<WithIdSlug>(cached);
        const found = all.find(match);
        if (found) return found;
      }

      return undefined;
    },
    [entityType, idOrSlug],
  ) as UserBase | ContextEntityBase | undefined;
}
