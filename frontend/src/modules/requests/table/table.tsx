import { Bird } from 'lucide-react';
import { forwardRef, memo, useCallback, useImperativeHandle } from 'react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import type { BaseTableMethods, BaseTableProps } from '~/modules/common/data-table/types';
import type { requestsQueryOptions } from '~/modules/requests/query';
import type { RequestsSearch } from '~/modules/requests/table/table-wrapper';
import type { Request } from '~/modules/requests/types';
import { useDataFromInfiniteQuery } from '~/query/hooks/use-data-from-query';

type BaseRequestsTableProps = BaseTableProps<Request, RequestsSearch, ReturnType<typeof requestsQueryOptions>>;

const BaseRequestsTable = memo(
  forwardRef<BaseTableMethods, BaseRequestsTableProps>(({ columns, queryOptions, searchVars, sortColumns, setSortColumns, setSelected }, ref) => {
    const { t } = useTranslation();

    // Extract query variables
    const { q, limit } = searchVars;

    // Query requests
    const { rows, selectedRows, setRows, setSelectedRows, isLoading, isFetching, error, hasNextPage, isFetchingNextPage, fetchNextPage } =
      useDataFromInfiniteQuery(queryOptions);

    const onRowsChange = async (changedRows: Request[]) => setRows(changedRows);

    const fetchMore = useCallback(async () => {
      if (!hasNextPage || isLoading || isFetching || isFetchingNextPage) return;
      await fetchNextPage();
    }, [hasNextPage, isLoading, isFetching, isFetchingNextPage]);

    const onSelectedRowsChange = (value: Set<string>) => {
      setSelectedRows(value);
      setSelected(rows.filter((row) => value.has(row.id)));
    };

    const onSortColumnsChange = (sortColumns: SortColumn[]) => {
      setSortColumns(sortColumns);
      onSelectedRowsChange(new Set<string>());
    };

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => onSelectedRowsChange(new Set<string>()),
    }));

    return (
      <DataTable<Request>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          rowHeight: 52,
          rowKeyGetter: (row) => row.id,
          error,
          isLoading,
          isFetching,
          enableVirtualization: false,
          isFiltered: !!q,
          limit,
          onRowsChange,
          hasNextPage,
          fetchMore,
          sortColumns,
          selectedRows,
          onSelectedRowsChange,
          onSortColumnsChange,
          NoRowsComponent: <ContentPlaceholder icon={Bird} title={t('common:no_resource_yet', { resource: t('common:requests').toLowerCase() })} />,
        }}
      />
    );
  }),
);
export default BaseRequestsTable;
