import { Bird } from 'lucide-react';
import { forwardRef, memo, useEffect, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import type { BaseTableMethods, BaseTableProps } from '~/modules/common/data-table/types';
import { requestsQueryOptions } from '~/modules/requests/query';
import type { RequestsSearch } from '~/modules/requests/table/table-wrapper';
import type { Request } from '~/modules/requests/types';
import { useDataFromInfiniteQuery } from '~/query/hooks/use-data-from-query';

type BaseRequestsTableProps = BaseTableProps<Request, RequestsSearch>;

const BaseRequestsTable = memo(
  forwardRef<BaseTableMethods, BaseRequestsTableProps>(({ columns, searchVars, sortColumns, setSortColumns, setTotal, setSelected }, ref) => {
    const { t } = useTranslation();

    // Extract query variables and set defaults
    const { q, sort, order, limit } = searchVars;

    // Query requests
    const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } = useDataFromInfiniteQuery(
      requestsQueryOptions({ q, sort, order, limit }),
    );

    const onRowsChange = async (changedRows: Request[]) => setRows(changedRows);

    const onSelectedRowsChange = (value: Set<string>) => {
      setSelectedRows(value);
      setSelected(rows.filter((row) => value.has(row.id)));
    };

    useEffect(() => setTotal(totalCount), [totalCount]);

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => onSelectedRowsChange(new Set<string>()),
    }));

    return (
      <DataTable<Request>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          totalCount,
          rowHeight: 50,
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
          onSelectedRowsChange,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:requests').toLowerCase() })} />,
        }}
      />
    );
  }),
);
export default BaseRequestsTable;
