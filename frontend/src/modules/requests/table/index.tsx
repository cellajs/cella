import { useInfiniteQuery } from '@tanstack/react-query';
import { appConfig } from 'config';
import { Bird } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import useSearchParams from '~/hooks/use-search-params';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { requestsQueryOptions } from '~/modules/requests/query';
import { useColumns } from '~/modules/requests/table/columns';
import { RequestsTableBar } from '~/modules/requests/table/table-bar';
import type { Request } from '~/modules/requests/types';
import { RequestsTableRoute, type requestSearchSchema } from '~/routes/system';

const LIMIT = appConfig.requestLimits.requests;

export type RequestsSearch = z.infer<typeof requestSearchSchema>;

const RequestsTable = () => {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<RequestsSearch>({ from: RequestsTableRoute.id });

  // Table state
  const { q, sort, order } = search;
  const limit = LIMIT;

  // Build columns
  const [selected, setSelected] = useState<Request[]>([]);
  const [columns, setColumns] = useColumns();
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  const queryOptions = requestsQueryOptions({ ...search, limit });
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
  const fetchMore = useCallback(async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await fetchNextPage();
  }, [hasNextPage, isLoading, isFetching]);

  const onSelectedRowsChange = (value: Set<string>) => {
    if (rows) setSelected(rows.filter((row) => value.has(row.id)));
  };

  return (
    <div className="flex flex-col gap-4 h-full">
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
          rowKeyGetter: (row) => row.id,
          columns: columns.filter((column) => column.visible),
          enableVirtualization: false,
          limit,
          error,
          isLoading,
          isFetching,
          isFiltered: !!q,
          hasNextPage,
          fetchMore,
          selectedRows: new Set(selected.map((s) => s.id)),
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: <ContentPlaceholder icon={Bird} title={t('common:no_resource_yet', { resource: t('common:requests').toLowerCase() })} />,
        }}
      />
    </div>
  );
};

export default RequestsTable;
