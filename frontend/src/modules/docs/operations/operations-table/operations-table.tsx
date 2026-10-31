import { useSuspenseQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { GenOperationSummary } from 'sdk/docs-types';
import { useSearchParams } from '~/hooks/use-search-params';
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
import { sortOperations } from '~/modules/docs/operations/operations-table/sort-operations';
import { isSwitchedOff } from '~/modules/docs/operations/switched-off-badge';
import { infoQueryOptions, operationsQueryOptions } from '~/modules/docs/query';
import { collectTagKinds } from '~/modules/docs/tag-table';
import type { OperationsTableRouteSearchParams } from '~/modules/docs/types';
import { useUIStore } from '~/modules/ui/ui-store';

export function OperationsTable() {
  const { t } = useTranslation();
  const focusView = useUIStore((state) => state.focusView);
  const { search, setSearch } = useSearchParams<OperationsTableRouteSearchParams>({ from: '/_public/_content/docs/operations_/table' });
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
          <OperationsBar operations={operations} total={filteredOperations.length} search={{ q, filter }} {...{ setSearch, columns, setColumns }} />
          <SearchScope q={q}>
            <DataTable<GenOperationSummary>
              columns={columns}
              rows={sortedOperations}
              hasNextPage={false}
              rowKeyGetter={(row) => row.hash}
              rowClass={(row) => (isSwitchedOff(row) ? 'opacity-60' : undefined)}
              isFiltered={!!q || !!filter}
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
