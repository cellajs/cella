import { BirdIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Request } from 'sdk';
import { useSearchParams } from '~/hooks/use-search-params';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { DataTable, rowKeyById } from '~/modules/common/data-table/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { useInfiniteRows } from '~/modules/common/data-table/use-infinite-rows';
import { useRowSelection } from '~/modules/common/data-table/use-row-selection';
import { requestsListQueryOptions } from '~/modules/requests/query';
import { RequestsTableBar } from '~/modules/requests/table/requests-bar';
import { useColumns } from '~/modules/requests/table/requests-columns';
import type { RequestsRouteSearchParams } from '~/modules/requests/types';

export function RequestsTable() {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<RequestsRouteSearchParams>({ from: '/_app/system/requests' });

  const { q, sort, order } = search;

  const [columns, setColumns] = useColumns();
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  const queryOptions = requestsListQueryOptions(search);
  const list = useInfiniteRows(queryOptions);
  const { selected, selectedRowIds, onSelectedRowsChange, clearSelection } = useRowSelection(list.rows);

  return (
    <>
      <RequestsTableBar
        queryKey={queryOptions.queryKey}
        selected={selected}
        columns={columns}
        setColumns={setColumns}
        searchVars={search}
        setSearch={setSearch}
        clearSelection={clearSelection}
      />
      <DataTable<Request>
        {...{
          ...list,
          rowKeyGetter: rowKeyById,
          columns,
          enableVirtualization: true,
          isFiltered: !!q,
          selectedRows: selectedRowIds,
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: (
            <ContentPlaceholder icon={BirdIcon} title="c:no_resource_yet" titleOptions={{ resource: t('c:request_other').toLowerCase() }} />
          ),
        }}
      />
    </>
  );
}
