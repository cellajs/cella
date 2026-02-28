import { useInfiniteQuery } from '@tanstack/react-query';
import { BirdIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import type { Request } from '~/api.gen';
import { useSearchParams } from '~/hooks/use-search-params';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { FocusViewContainer } from '~/modules/common/focus-view';
import { requestsListQueryOptions } from '~/modules/requests/query';
import { RequestsTableBar } from '~/modules/requests/table/requests-bar';
import { useColumns } from '~/modules/requests/table/requests-columns';
import type { RequestsRouteSearchParams } from '~/modules/requests/types';

const LIMIT = appConfig.requestLimits.requests;

/** Stable row key getter function - defined outside component to prevent re-renders */
function rowKeyGetter(row: Request) {
  return row.id;
}

function RequestsTable() {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<RequestsRouteSearchParams>({ from: '/appLayout/system/requests' });

  // Table state
  const { q, sort, order } = search;
  const limit = LIMIT;

  // Build columns
  const [selected, setSelected] = useState<Request[]>([]);
  const [columns, setColumns] = useColumns();
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  const queryOptions = requestsListQueryOptions({ ...search, limit });
  const {
    data: rows,
    isLoading,
    isFetching,
    error,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    ...queryOptions,
    select: ({ pages }) => pages.flatMap(({ items }) => items),
  });

  // isFetching already includes next page fetch scenario
  const fetchMore = async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await fetchNextPage();
  };

  const onSelectedRowsChange = (value: Set<string>) => {
    if (rows) setSelected(rows.filter((row) => value.has(row.id)));
  };

  const selectedRowIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  const visibleColumns = useMemo(() => columns.filter((column) => column.visible), [columns]);

  return (
    <FocusViewContainer>
      <RequestsTableBar
        queryKey={queryOptions.queryKey}
        selected={selected}
        columns={columns}
        setColumns={setColumns}
        searchVars={{ ...search, limit }}
        setSearch={setSearch}
        clearSelection={() => setSelected([])}
      />
      <DataTable<Request>
        {...{
          rows,
          rowHeight: 52,
          rowKeyGetter,
          columns: visibleColumns,
          enableVirtualization: true,
          limit,
          error,
          isLoading,
          isFetching,
          isFiltered: !!q,
          hasNextPage,
          fetchMore,
          selectedRows: selectedRowIds,
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: (
            <ContentPlaceholder
              icon={BirdIcon}
              title="common:no_resource_yet"
              titleProps={{ resource: t('common:requests').toLowerCase() }}
            />
          ),
        }}
      />
    </FocusViewContainer>
  );
}

export default RequestsTable;
