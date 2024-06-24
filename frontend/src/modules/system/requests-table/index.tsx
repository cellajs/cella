import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

import type { getRequestsQuerySchema } from 'backend/modules/requests/schema';
import { Bird } from 'lucide-react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { type GetRequestsParams, getRequests } from '~/api/requests';
import { useDebounce } from '~/hooks/use-debounce';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { getInitialSortColumns } from '~/modules/common/data-table/init-sort-columns';
import { RequestsTableRoute } from '~/routes/system';
import type { Request } from '~/types';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import useMapQueryDataToRows from '~/hooks/use-map-query-data-to-rows';
import { DataTable } from '~/modules/common/data-table';
import { useColumns } from './columns';
import { config } from 'config';
import { Mailbox, Trash, XSquare } from 'lucide-react';

import ColumnsView from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { FocusView } from '~/modules/common/focus-view';
import { sheet } from '~/modules/common/sheeter/state';
import NewsletterForm from '~/modules/system/newsletter-form';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';

type RequestsSearch = z.infer<typeof getRequestsQuerySchema>;

export const requestsQueryOptions = ({ q, sort: initialSort, order: initialOrder, limit }: GetRequestsParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: ['requests', q, sort, order],
    initialPageParam: 0,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) => await getRequests({ page, q, sort, order, limit }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

const LIMIT = 40;

const RequestsTable = () => {
  const search = useSearch({ from: RequestsTableRoute.id });
  const { t } = useTranslation();
  const [rows, setRows] = useState<Request[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [query, setQuery] = useState<RequestsSearch['q']>(search.q);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // Search query options
  const q = useDebounce(query, 200);
  const sort = sortColumns[0]?.columnKey as RequestsSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as RequestsSearch['order'];
  const limit = LIMIT;

  const isFiltered = !!q;

  // Query organizations
  const queryResult = useInfiniteQuery(requestsQueryOptions({ q, sort, order, limit }));

  // Total count
  const totalCount = queryResult.data?.pages[0].total;

  // Build columns
  const [columns, setColumns] = useColumns();

  // Map (updated) query data to rows
  useMapQueryDataToRows<Request>({ queryResult, setSelectedRows, setRows, selectedRows });

  // Save filters in search params
  const filters = useMemo(
    () => ({
      q,
      sort: sortColumns[0]?.columnKey,
      order: sortColumns[0]?.direction.toLowerCase(),
    }),
    [q, sortColumns],
  );
  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

  const onRowsChange = async (changedRows: Request[]) => {
    setRows(changedRows);
  };

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
  };

  const selectedRequests = useMemo(() => {
    return rows.filter((row) => selectedRows.has(row.id));
  }, [selectedRows, rows]);

  const openDeleteDialog = () => {
    console.log('decline requests');
  };

  const openNewsletterSheet = () => {
    sheet(<NewsletterForm sheet />, {
      className: 'max-w-full lg:max-w-[900px]',
      title: t('common:newsletter'),
      text: t('common:newsletter.text'),
      id: 'newsletter-form',
    });
  };

  return (
    <div className="space-y-4 h-full">
      <div className={'flex items-center max-sm:justify-between md:gap-2'}>
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            {selectedRequests.length > 0 && (
              <>
                <Button onClick={openNewsletterSheet} className="relative">
                  <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{selectedRequests.length}</Badge>
                  <Mailbox size={16} />
                  <span className="ml-1 max-xs:hidden">{t('common:newsletter')}</span>
                </Button>
                <Button variant="destructive" className="relative" onClick={openDeleteDialog}>
                  <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{selectedRequests.length}</Badge>
                  <Trash size={16} />
                  <span className="ml-1 max-lg:hidden">{t('common:decline_request')}</span>
                </Button>
                <Button variant="ghost" onClick={() => setSelectedRows(new Set<string>())}>
                  <XSquare size={16} />
                  <span className="ml-1">{t('common:clear')}</span>
                </Button>
              </>
            )}
            {selectedRequests.length === 0 && (
              <TableCount count={totalCount} type="request" isFiltered={isFiltered} onResetFilters={onResetFilters} />
            )}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarContent>
            <TableSearch value={query} setQuery={setQuery} />
          </FilterBarContent>
        </TableFilterBar>
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
        <Export
          className="max-lg:hidden"
          filename={`${config.slug}-requests`}
          columns={columns}
          selectedRows={selectedRequests}
          fetchRows={async (limit) => {
            const { items } = await getRequests({ limit, q: query, sort, order });
            return items;
          }}
        />
        <FocusView iconOnly />
      </div>
      <DataTable<Request>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          totalCount,
          rowHeight: 42,
          rowKeyGetter: (row) => row.id,
          error: queryResult.error,
          isLoading: queryResult.isLoading,
          isFetching: queryResult.isFetching,
          enableVirtualization: false,
          isFiltered,
          limit,
          selectedRows,
          onRowsChange,
          fetchMore: queryResult.fetchNextPage,
          onSelectedRowsChange: setSelectedRows,
          sortColumns,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:requests').toLowerCase() })} />,
        }}
      />
    </div>
  );
};

export default RequestsTable;
