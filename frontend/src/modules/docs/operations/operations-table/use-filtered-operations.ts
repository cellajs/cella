import { useMemo } from 'react';
import type { GenOperationSummary } from 'sdk/docs-types';
import { matchesSearch, parseSearchQuery } from 'shared/utils/parse-search-query';
import { foldText } from 'shared/utils/text-match';

/** The filter value for operations exposed as MCP tools; tag filters always hold a colon, so it never collides. */
export const mcpToolFilter = 'mcp';

interface FilterOptions {
  /** Free-text query in the shared search grammar (`parseSearchQuery`). */
  q: string;
  /** `${kind}:${value}` (e.g. `'owner:cella'`) keeps the operations whose `tagsByKind[kind]` holds `value`; `mcpToolFilter` keeps MCP tools. */
  tag?: string;
}

/** An operation's text fields, folded for `matchesSearch`. */
const searchFields = (op: GenOperationSummary) =>
  [
    op.summary,
    op.id,
    op.method,
    op.path,
    op.description,
    ...op.tags,
    ...Object.values(op.tagsByKind).flat(),
    ...Object.values(op.extensions).flat(),
  ].map(foldText);

export function useFilteredOperations(operations: GenOperationSummary[], { q, tag }: FilterOptions) {
  return useMemo(() => {
    let ops = operations;
    if (tag === mcpToolFilter) {
      ops = ops.filter((op) => op.tool);
    } else if (tag) {
      const colonIndex = tag.indexOf(':');
      if (colonIndex > 0) {
        const kind = tag.slice(0, colonIndex);
        const value = tag.slice(colonIndex + 1);
        ops = ops.filter((op) => op.tagsByKind[kind]?.includes(value));
      }
    }

    const search = parseSearchQuery(q);
    if (!search.effectiveQ) return ops;

    return ops.filter((op) => matchesSearch(searchFields(op), search));
  }, [operations, q, tag]);
}
