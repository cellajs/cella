import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { GenOperationSummary } from 'sdk/docs-types';
import { isSwitchOn } from 'shared';
import { useSearchParams } from '~/hooks/use-search-params';
import type { SortColumn } from '~/modules/common/data-grid';
import { DataTable } from '~/modules/common/data-table/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { SearchScope } from '~/modules/common/match-highlight/match-scope';
import { ScrollReset } from '~/modules/common/scroll-reset';
import { DocsPageHeader } from '~/modules/docs/docs-page-header';
import { AccessCellPopover } from '~/modules/docs/operations/access-explanation';
import { OperationsBar } from '~/modules/docs/operations/operations-bar';
import { filterOperations } from '~/modules/docs/operations/operations-filter';
import { useColumns } from '~/modules/docs/operations/operations-table/operations-columns';
import { infoQueryOptions, operationsQueryOptions } from '~/modules/docs/query';
import { collectTagKinds } from '~/modules/docs/tag-table';
import type { OperationsTableRouteSearchParams } from '~/modules/docs/types';
import { useUIStore } from '~/modules/ui/ui-store';

/** Comparable key from string values, `''` when missing or empty so the comparator can pin those last. */
const arrayKey = (values: string[] | undefined): string => (values?.length ? [...values].sort().join(',') : '');

/** Dynamic tag (`tag-${kind}`) and extension columns sort by their joined sorted values. */
const getSortValue = (row: GenOperationSummary, columnKey: string): string => {
  if (columnKey.startsWith('tag-')) return arrayKey(row.tagsByKind[columnKey.slice(4)]);
  if (columnKey in row.extensions) return arrayKey(row.extensions[columnKey]);
  return String(row[columnKey as keyof GenOperationSummary] ?? '');
};

/** Client-side sort by the first active sort column, with a locale-aware string compare. */
function sortOperations(operations: GenOperationSummary[], sortColumns: SortColumn[]) {
  if (!sortColumns.length) return operations;
  const { columnKey, direction } = sortColumns[0];
  const modifier = direction === 'ASC' ? 1 : -1;
  return [...operations].sort((a, b) => {
    const aValue = getSortValue(a, columnKey);
    const bValue = getSortValue(b, columnKey);
    // Push empties to the bottom in both ASC and DESC.
    if (!aValue && !bValue) return 0;
    if (!aValue) return 1;
    if (!bValue) return -1;
    return aValue.localeCompare(bValue) * modifier;
  });
}

export function OperationsTable() {
  const { t } = useTranslation();
  const focusView = useUIStore((state) => state.focusView);
  const { search, setSearch } = useSearchParams<OperationsTableRouteSearchParams>({ from: '/_public/docs/operations_/table' });
  const { q, filter } = search;

  const { sortColumns, setSortColumns } = useSortColumns(search.sort, search.order, setSearch);

  const { data: info } = useSuspenseQuery(infoQueryOptions);
  const extensions = info.extensions.filter((ext) => ext.kind === 'middleware');

  const { data: operations } = useSuspenseQuery(operationsQueryOptions);

  const tagKinds = collectTagKinds(operations);

  const [columns, setColumns] = useColumns(extensions, tagKinds);

  const filteredOperations = filterOperations(operations, { q, filter });
  const sortedOperations = sortOperations(filteredOperations, sortColumns);

  return (
    <>
      {/* Outside the focus-view container so focus view hides it along with the rest of the chrome */}
      <div className="container">
        <DocsPageHeader title={t('c:operation', { count: 2 })} />
      </div>

      <ScrollReset>
        <FocusViewContainer>
          <OperationsBar total={filteredOperations.length} search={{ q, filter }} {...{ operations, setSearch, columns, setColumns }} />
          <SearchScope q={q}>
            <DataTable<GenOperationSummary>
              columns={columns}
              rows={sortedOperations}
              hasNextPage={false}
              rowKeyGetter={(row) => row.hash}
              // An operation whose config switch is off in this app dims: the API refuses it, the docs still list it
              rowClass={(row) => (row.enabledBy && !isSwitchOn(row.enabledBy) ? 'opacity-60' : undefined)}
              isFiltered={!!q || !!filter}
              onResetFilters={() => setSearch({ q: '', filter: undefined })}
              rowHeight={42}
              enableVirtualization
              resetWidthsKey={focusView ? 'focus' : 'normal'}
              sortColumns={sortColumns}
              onSortColumnsChange={setSortColumns}
            />
            <AccessCellPopover />
          </SearchScope>
        </FocusViewContainer>
      </ScrollReset>
    </>
  );
}
