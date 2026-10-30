import { useRouterState } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { GenOperationSummary } from 'sdk/docs-types';
import { matchesSearch, parseSearchQuery } from 'shared/utils/parse-search-query';
import { foldText } from 'shared/utils/text-match';
import { upperFirst } from '~/modules/docs/helpers/upper-first';
import type { OperationSearch } from '~/modules/docs/types';

/** The filter value for operations exposed as MCP tools; tag filters always hold a colon, so it never collides. */
const mcpToolFilter = 'mcp';

/** Display order for tag-kind groups in the filter dropdown. */
const kindOrder = ['owner', 'entity'];

/** Tag kinds without a filter option: the sidebar picks the module, and schema tags do not apply to operations. */
const unfilteredKinds = ['module', 'schema'];

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
    ...op.extensionNames,
  ].map(foldText);

/** The operations a search keeps. `filter` is `${kind}:${value}` (`owner:cella`) or the MCP tools filter; `q` uses the shared search grammar. */
export function filterOperations(operations: GenOperationSummary[], { q, filter }: OperationSearch) {
  let matches = operations;
  if (filter === mcpToolFilter) {
    matches = matches.filter((op) => op.tool);
  } else if (filter) {
    const colonIndex = filter.indexOf(':');
    if (colonIndex > 0) {
      const kind = filter.slice(0, colonIndex);
      const value = filter.slice(colonIndex + 1);
      matches = matches.filter((op) => op.tagsByKind[kind]?.includes(value));
    }
  }

  const search = parseSearchQuery(q);
  if (!search.effectiveQ) return matches;

  return matches.filter((op) => matchesSearch(searchFields(op), search));
}

/** The options of the filter select, grouped by what they narrow. Counted over every operation, so the numbers hold still while a search narrows the rows. */
export function useOperationFilterOptions(operations: GenOperationSummary[]) {
  const { t } = useTranslation();

  const countsByKind: Record<string, Record<string, number>> = {};
  for (const op of operations) {
    for (const [kind, values] of Object.entries(op.tagsByKind)) {
      if (unfilteredKinds.includes(kind)) continue;
      const counts = countsByKind[kind] ?? {};
      for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
      countsByKind[kind] = counts;
    }
  }
  const orderedKinds = [...kindOrder.filter((kind) => countsByKind[kind]), ...Object.keys(countsByKind).filter((kind) => !kindOrder.includes(kind))];

  const tagOptions = orderedKinds.flatMap((kind) =>
    Object.entries(countsByKind[kind]).map(([value, count]) => ({
      value: `${kind}:${value}`,
      label: kind === 'entity' ? t('c:docs.entity_tag', { name: upperFirst(value) }) : upperFirst(value),
      group: upperFirst(kind),
      count,
    })),
  );
  const toolCount = operations.filter((op) => op.tool).length;
  const toolOptions = toolCount ? [{ value: mcpToolFilter, label: t('c:docs.mcp_tools'), group: t('c:docs.exposed_as'), count: toolCount }] : [];

  // An option every operation matches filters nothing, as owner "cella" in the template
  return [...tagOptions, ...toolOptions].filter((option) => option.count < operations.length);
}

/** The search in the URL, for a part of the docs layout outside the route, such as the sidebar. */
export function useOperationSearch(): OperationSearch {
  const q = useRouterState({ select: (state) => state.location.search.q });
  const filter = useRouterState({ select: (state) => state.location.search.filter });
  return { q, filter };
}

/** Clears the search on a link to a section the search hides: the section renders, and a queued scroll then finds it. */
export const clearedOperationSearch = { q: undefined, filter: undefined };
