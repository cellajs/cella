import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { GenOperationSummary } from 'sdk/docs-types';
import { useSearchParams } from '~/hooks/use-search-params';
import { DataTable } from '~/modules/common/data-table/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { SearchScope } from '~/modules/common/match-highlight/match-scope';
import { DocsPageHeader } from '~/modules/docs/docs-page-header';
import { OperationsTableBar } from '~/modules/docs/operations/operations-table/operations-bar';
import { useColumns } from '~/modules/docs/operations/operations-table/operations-columns';
import { useFilteredOperations } from '~/modules/docs/operations/operations-table/use-filtered-operations';
import { useSortedOperations } from '~/modules/docs/operations/operations-table/use-sorted-operations';
import { isSwitchedOff } from '~/modules/docs/operations/switched-off-badge';
import { infoQueryOptions, operationsQueryOptions } from '~/modules/docs/query';
import { collectTagKinds } from '~/modules/docs/tag-table';
import { useUIStore } from '~/modules/ui/ui-store';

export function OperationsTable() {
  const { t } = useTranslation();
  const focusView = useUIStore((state) => state.focusView);
  const { search, setSearch } = useSearchParams<{ q?: string; sort?: string; order?: 'asc' | 'desc'; tag?: string }>({
    from: '/_public/_content/docs/operations_/table',
  });

  const q = search.q || '';
  const tag = search.tag;

  const { sortColumns, setSortColumns } = useSortColumns(search.sort, search.order, setSearch);

  const { data: info } = useSuspenseQuery(infoQueryOptions);
  const extensions = info.extensions.filter((ext) => ext.kind === 'middleware');

  const { data: operations } = useSuspenseQuery(operationsQueryOptions);

  const tagKinds = collectTagKinds(operations);

  // kind -> distinct values present; 'module' is driven by the sidebar and 'schema' does not apply here
  const valuesByKind: Record<string, Set<string>> = {};
  for (const op of operations) {
    for (const [kind, values] of Object.entries(op.tagsByKind)) {
      if (kind === 'module' || kind === 'schema') continue;
      if (!valuesByKind[kind]) valuesByKind[kind] = new Set();
      for (const value of values) valuesByKind[kind].add(value);
    }
  }
  const tagFilters = Object.fromEntries(Object.entries(valuesByKind).map(([kind, values]) => [kind, [...values]]));

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
          hasMcpTools={operations.some((op) => op.tool)}
        />
        <SearchScope q={q}>
          <DataTable<GenOperationSummary>
            columns={columns}
            rows={sortedOperations}
            cellSelectionMode="none"
            hasNextPage={false}
            rowKeyGetter={(row) => row.hash}
            rowClass={(row) => (isSwitchedOff(row) ? 'opacity-60' : undefined)}
            isFiltered={!!q}
            rowHeight={42}
            enableVirtualization
            resetWidthsKey={focusView ? 'focus' : 'normal'}
            sortColumns={sortColumns}
            onSortColumnsChange={setSortColumns}
          />
        </SearchScope>
      </FocusViewContainer>
    </>
  );
}
