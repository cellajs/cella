import { useSuspenseQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from '~/hooks/use-search-params';
import { DataTable } from '~/modules/common/data-table/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { DocsPageHeader } from '~/modules/docs/docs-page-header';
import { OperationsTableBar } from '~/modules/docs/operations/operations-table/operations-bar';
import { useColumns } from '~/modules/docs/operations/operations-table/operations-columns';
import { useFilteredOperations } from '~/modules/docs/operations/operations-table/use-filtered-operations';
import { useSortedOperations } from '~/modules/docs/operations/operations-table/use-sorted-operations';
import { infoQueryOptions, operationsQueryOptions } from '~/modules/docs/query';
import type { GenOperationSummary } from '~/modules/docs/types';
import { useUIStore } from '~/modules/ui/ui-store';

function OperationsTable() {
  const { t } = useTranslation();
  const focusView = useUIStore((state) => state.focusView);
  const { search, setSearch } = useSearchParams<{
    q?: string;
    sort?: string;
    order?: 'asc' | 'desc';
    tag?: string;
  }>({
    from: '/_public/_content/docs/operations_/table',
  });

  const q = search.q || '';
  const tag = search.tag;

  // Sort state backed by URL search params
  const { sortColumns, setSortColumns } = useSortColumns(search.sort, search.order, setSearch);

  // Fetch info to get extension definitions
  const { data: info } = useSuspenseQuery(infoQueryOptions);
  const extensions = info.extensions.filter((ext) => ext.kind === 'middleware');

  // Fetch operations via React Query (reduces bundle size)
  const { data: operations } = useSuspenseQuery(operationsQueryOptions);

  // Derive distinct tag kinds from operations data
  const tagKinds = useMemo(() => {
    const kinds = new Set<string>();
    for (const op of operations) {
      if (op.tagsByKind) for (const kind of Object.keys(op.tagsByKind)) kinds.add(kind);
    }
    return Array.from(kinds);
  }, [operations]);

  // Derive available tag-kind filter options (kind -> distinct values present).
  // Excludes 'module' (driven by the sidebar) and 'schema' (not applicable here).
  const tagFilters = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const op of operations) {
      for (const [kind, values] of Object.entries(op.tagsByKind ?? {})) {
        if (kind === 'module' || kind === 'schema') continue;
        if (!map[kind]) map[kind] = new Set();
        for (const v of values) map[kind].add(v);
      }
    }
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [...v]]));
  }, [operations]);

  const [columns, setColumns] = useColumns(extensions, tagKinds);

  const filteredOperations = useFilteredOperations(operations, { q, tag });
  const sortedOperations = useSortedOperations(filteredOperations, sortColumns);

  return (
    <>
      {/* Outside the focus-view container so focus view hides it along with the rest of the chrome */}
      <div className="container">
        <DocsPageHeader title={t('c:operation', { count: 2 })} />
      </div>

      <FocusViewContainer>
        <OperationsTableBar
          total={filteredOperations.length}
          searchVars={{ q, tag }}
          setSearch={setSearch}
          columns={columns}
          setColumns={setColumns}
          tagFilters={tagFilters}
        />
        <DataTable<GenOperationSummary>
          columns={columns}
          rows={sortedOperations}
          cellSelectionMode="none"
          hasNextPage={false}
          rowKeyGetter={(row) => row.hash}
          isLoading={false}
          isFetching={false}
          limit={sortedOperations.length}
          isFiltered={!!q}
          rowHeight={42}
          enableVirtualization
          enableStickyHeader
          resetWidthsKey={focusView ? 'focus' : 'normal'}
          sortColumns={sortColumns}
          onSortColumnsChange={setSortColumns}
        />
      </FocusViewContainer>
    </>
  );
}

export { OperationsTable };
