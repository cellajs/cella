import { type Dispatch, type SetStateAction, forwardRef, useImperativeHandle, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDataFromSuspenseInfiniteQuery } from '~/hooks/use-data-from-query';
import { DataTable } from '~/modules/common/data-table';

import { Bird } from 'lucide-react';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import type { Request } from '~/types/common';

import type { SortColumn } from 'react-data-grid';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import type { RequestsSearch, RequestsTableMethods } from '~/modules/system/requests-table';
import { requestsQueryOptions } from './helpers/query-option';

type BaseRequestsTableProps = {
  tableId: string;
  columns: ColumnOrColumnGroup<Request>[];
  sortColumns: SortColumn[];
  setSortColumns: Dispatch<SetStateAction<SortColumn[]>>;
  queryVars: {
    q: RequestsSearch['q'] | undefined;
    sort: RequestsSearch['sort'] | undefined;
    order: RequestsSearch['order'] | undefined;
    limit: number;
  };
};

const BaseRequestsTable = forwardRef<RequestsTableMethods, BaseRequestsTableProps>(
  ({ tableId, columns, sortColumns, setSortColumns, queryVars }: BaseRequestsTableProps, ref) => {
    const { t } = useTranslation();

    const { q, sort, order, limit } = queryVars;

    // Query requests
    const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } =
      useDataFromSuspenseInfiniteQuery(requestsQueryOptions({ q, sort, order, limit }));

    // Table selection
    const selectedRequests = useMemo(() => {
      return rows.filter((row) => selectedRows.has(row.id));
    }, [selectedRows, rows]);

    const onRowsChange = async (changedRows: Request[]) => setRows(changedRows);

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => setSelectedRows(new Set<string>()),
      //TODO implement accept and remove of request
      openRemoveDialog: () => console.log('removed'),
      openInviteDialog: () => console.log('invited'),
    }));

    return (
      <div id={tableId} data-total-count={totalCount} data-selected={selectedRequests.length}>
        <DataTable<Request>
          {...{
            columns: columns.filter((column) => column.visible),
            rows,
            totalCount,
            rowHeight: 42,
            rowKeyGetter: (row) => row.id,
            error,
            isLoading,
            isFetching,
            enableVirtualization: false,
            isFiltered: !!q,
            limit,
            onRowsChange,
            fetchMore: fetchNextPage,
            sortColumns,
            selectedRows,
            onSelectedRowsChange: setSelectedRows,
            onSortColumnsChange: setSortColumns,
            NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:requests').toLowerCase() })} />,
          }}
        />
      </div>
    );
  },
);

export default BaseRequestsTable;
