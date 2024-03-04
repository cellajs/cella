import { infiniteQueryOptions, useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Member } from '~/types';

import { getMembersByOrganizationIdentifier } from '~/api/organizations';
import { DataTable } from '~/modules/common/data-table';

import { Bird } from 'lucide-react';
import { SortColumn } from 'react-data-grid';
import useMutateQueryData from '~/hooks/use-mutate-query-data';
import { OrganizationContext } from '~/modules/organizations/organization';
import { MembersSearch, organizationMembersRoute } from '~/router/routeTree';
import useSaveInSearchParams from '../../../hooks/use-save-in-search-params';
import { useColumns } from './columns';
import Toolbar from './toolbar';

export const membersQueryOptions = ({
  organizationIdentifier,
  q,
  sort: initialSort,
  order: initialOrder,
  role,
}: {
  organizationIdentifier: string;
  q?: string;
  sort?: MembersSearch['sort'];
  order?: MembersSearch['order'];
  role?: MembersSearch['role'];
}) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: ['members', organizationIdentifier, q, sort, order, role],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const fetchedData = await getMembersByOrganizationIdentifier(
        organizationIdentifier,
        {
          page: pageParam,
          q,
          sort,
          order,
          role,
        },
        signal,
      );

      return fetchedData;
    },
    getNextPageParam: (_lastPage, allPages) => allPages.length,
    refetchOnWindowFocus: false,
  });
};

const MembersTable = () => {
  const { organization } = useContext(OrganizationContext);
  const [columns, setColumns] = useColumns();
  const search = useSearch({
    from: organizationMembersRoute.id,
  });

  const [rows, setRows] = useState<Member[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(
    search.sort && search.order
      ? [
          {
            columnKey: search.sort,
            direction: search.order === 'asc' ? 'ASC' : 'DESC',
          },
        ]
      : [
          {
            columnKey: 'createdAt',
            direction: 'DESC',
          },
        ],
  );
  const [query, setQuery] = useState<MembersSearch['q']>(search.q);
  const [role, setRole] = useState<MembersSearch['role']>(search.role);

  // Save filters in search params
  const filters = useMemo(
    () => ({
      q: query,
      sort: sortColumns[0]?.columnKey,
      order: sortColumns[0]?.direction.toLowerCase(),
      role,
    }),
    [query, role, sortColumns],
  );
  useSaveInSearchParams(filters, {
    sort: 'createdAt',
    order: 'desc',
  });

  const callback = useMutateQueryData([
    'members',
    organization.slug,
    query,
    sortColumns[0]?.columnKey,
    sortColumns[0]?.direction.toLowerCase(),
    role,
  ]);

  const queryResult = useSuspenseInfiniteQuery(
    membersQueryOptions({
      organizationIdentifier: organization.slug,
      q: query,
      sort: sortColumns[0]?.columnKey as MembersSearch['sort'],
      order: sortColumns[0]?.direction.toLowerCase() as MembersSearch['order'],
      role,
    }),
  );

  const isFiltered = role !== undefined || !!query;

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
    setRole(undefined);
  };

  useEffect(() => {
    const data = queryResult.data?.pages?.flatMap((page) => page.items);

    if (data) {
      setSelectedRows(new Set<string>());
      setRows(data);
    }
  }, [queryResult.data]);
  const { t } = useTranslation();
  return (
    <div className="space-y-4 h-full">
      <Toolbar
        isFiltered={isFiltered}
        total={queryResult.data?.pages[0].total}
        query={query}
        columns={columns}
        setColumns={setColumns}
        refetch={queryResult.refetch}
        setQuery={setQuery}
        callback={callback}
        onResetFilters={onResetFilters}
        onResetSelectedRows={() => setSelectedRows(new Set<string>())}
        organization={organization}
        role={role}
        sort={sortColumns[0]?.columnKey as MembersSearch['sort']}
        order={sortColumns[0]?.direction.toLowerCase() as MembersSearch['order']}
        selectedMembers={rows.filter((row) => selectedRows.has(row.id))}
        setRole={setRole}
      />
      <DataTable<Member>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          totalCount: queryResult.data?.pages[0].total,
          rowHeight: 42,
          rowKeyGetter: (row) => row.id,
          enableVirtualization: false,
          error: queryResult.error,
          isLoading: queryResult.isLoading,
          isFetching: queryResult.isFetching,
          fetchMore: queryResult.fetchNextPage,
          overflowNoRows: true,
          isFiltered,
          onResetFilters,
          selectedRows,
          onSelectedRowsChange: setSelectedRows,
          sortColumns,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: (
            <>
              <Bird className="w-20 h-20" />
              <div className="mt-6 text-sm font-light">{t('common:no_members')}</div>
            </>
          ),
        }}
      />
    </div>
  );
};

export default MembersTable;
