import { useInfiniteQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { getOrganizations, updateUserInOrganization } from '~/api/organizations';

import type { getOrganizationsQuerySchema } from 'backend/modules/organizations/schema';
import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';
import useMutateQueryData from '~/hooks/use-mutate-query-data';
import { OrganizationsTableRoute } from '~/router/system';
import { useUserStore } from '~/store/user';
import type { Organization } from '~/types';
import useSaveInSearchParams from '../../../hooks/use-save-in-search-params';
import { DataTable } from '../../common/data-table';
import { useColumns } from './columns';
import Toolbar from './toolbar';
import { Bird } from 'lucide-react';

export type OrganizationsSearch = z.infer<typeof getOrganizationsQuerySchema>;

const OrganizationsTable = () => {
  const search = useSearch({
    from: OrganizationsTableRoute.id,
  });
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);
  const [rows, setRows] = useState<Organization[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(
    search.sort && search.order
      ? [{ columnKey: search.sort, direction: search.order === 'asc' ? 'ASC' : 'DESC' }]
      : [{ columnKey: 'createdAt', direction: 'DESC' }],
  );
  const [query, setQuery] = useState<OrganizationsSearch['q']>(search.q);

  // Save filters in search params
  const filters = useMemo(
    () => ({
      q: query,
      sort: sortColumns[0]?.columnKey,
      order: sortColumns[0]?.direction.toLowerCase(),
    }),
    [query, sortColumns],
  );

  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

  const callback = useMutateQueryData(['organizations', query, sortColumns]);

  const queryResult = useInfiniteQuery({
    queryKey: ['organizations', query, sortColumns],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const fetchedData = await getOrganizations(
        {
          page: pageParam,
          q: query,
          sort: sortColumns[0]?.columnKey as OrganizationsSearch['sort'],
          order: sortColumns[0]?.direction.toLowerCase() as OrganizationsSearch['order'],
        },
        signal,
      );
      return fetchedData;
    },
    getNextPageParam: (_lastGroup, groups) => groups.length,
    refetchOnWindowFocus: false,
  });

  const [columns, setColumns] = useColumns(callback);

  const onRowsChange = async (records: Organization[], { column, indexes }: RowsChangeData<Organization>) => {
    // mutate member
    for (const index of indexes) {
      const organization = records[index];
      if (column.key === 'userRole' && organization.userRole) {
        updateUserInOrganization(organization.id, user.id, organization.userRole)
          .then(() => {
            toast.success(t('common:success.your_role_updated'));
          })
          .catch(() => {
            toast.error(t('common:error.error'));
          });
      }
    }

    setRows(records);
  };

  const isFiltered = !!query;

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
  };

  useEffect(() => {
    const data = queryResult.data?.pages?.flatMap((page) => page.items);

    if (data) {
      setSelectedRows(new Set<string>([...selectedRows].filter((id) => data.some((row) => row.id === id))));
      setRows(data);
    }
  }, [queryResult.data]);

  return (
    <div className="space-y-4 h-full">
      <Toolbar
        total={queryResult.data?.pages?.[0]?.total}
        query={query}
        setQuery={setQuery}
        callback={callback}
        isFiltered={isFiltered}
        selectedOrganizations={rows.filter((row) => selectedRows.has(row.id))}
        onResetFilters={onResetFilters}
        onResetSelectedRows={() => setSelectedRows(new Set<string>())}
        columns={columns}
        setColumns={setColumns}
        sort={sortColumns[0]?.columnKey as OrganizationsSearch['sort']}
        order={sortColumns[0]?.direction.toLowerCase() as OrganizationsSearch['order']}
      />
      <DataTable<Organization>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          totalCount: queryResult.data?.pages[0].total,
          rowHeight: 42,
          rowKeyGetter: (row) => row.id,
          error: queryResult.error,
          isLoading: queryResult.isLoading,
          isFetching: queryResult.isFetching,
          enableVirtualization: false,
          isFiltered,
          selectedRows,
          onRowsChange,
          fetchMore: queryResult.fetchNextPage,
          onSelectedRowsChange: setSelectedRows,
          sortColumns,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: (
            <>
              <Bird strokeWidth={1} className="w-20 h-20" />
              <div className="mt-6 text-sm font-light">{t('common:no_organizations')}</div>
            </>
          ),
        }}
      />
    </div>
  );
};

export default OrganizationsTable;
