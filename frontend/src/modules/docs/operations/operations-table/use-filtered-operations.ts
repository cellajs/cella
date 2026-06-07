import { useMemo } from 'react';
import type { GenOperationSummary } from '~/modules/docs/types';

interface FilterOptions {
  /** Free-text query; space-separated terms are AND-combined. */
  q: string;
  /**
   * Tag filter encoded as `${kind}:${value}` (e.g. `'owner:cella'`,
   * `'entity:context'`). Restricts to operations whose `tagsByKind[kind]`
   * includes `value`.
   */
  tag?: string;
}

/** Match a single search term against any text-like field of an operation. */
const matchesTerm = (op: GenOperationSummary, term: string): boolean =>
  op.summary.toLowerCase().includes(term) ||
  op.id.toLowerCase().includes(term) ||
  op.method.toLowerCase().includes(term) ||
  op.path.toLowerCase().includes(term) ||
  !!op.description?.toLowerCase().includes(term) ||
  !!op.tags?.some((tag) => tag.toLowerCase().includes(term)) ||
  Object.values(op.tagsByKind ?? {}).some((values) => values.some((v) => v.toLowerCase().includes(term))) ||
  Object.values(op.extensions).some((values) => values.some((v) => v.toLowerCase().includes(term)));

/**
 * Filter operations by an optional `${kind}:${value}` tag selector and a
 * free-text query (space-separated terms are AND-combined).
 */
export function useFilteredOperations(operations: GenOperationSummary[], { q, tag }: FilterOptions) {
  return useMemo(() => {
    let ops = operations;
    if (tag) {
      const sep = tag.indexOf(':');
      if (sep > 0) {
        const kind = tag.slice(0, sep);
        const value = tag.slice(sep + 1);
        ops = ops.filter((op) => op.tagsByKind?.[kind]?.includes(value));
      }
    }

    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return ops;

    return ops.filter((op) => terms.every((term) => matchesTerm(op, term)));
  }, [operations, q, tag]);
}
