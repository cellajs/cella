import { InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useContext, useEffect, useState } from 'react';
import { getMembersByOrganizationIdentifier } from '~/api/organizations';
import { Member } from '~/types';

import { DataTable } from '~/modules/common/data-table';

import { Bird } from 'lucide-react';
import { OrganizationContext } from '~/modules/organizations/organization';
import { queryClient } from '~/router';
import { MemberSearch, MembersTableRoute } from '~/router/routeTree';
import { useColumns } from './columns';
import Toolbar from './toolbar';
import { SortColumn } from 'react-data-grid';

type QueryData = Awaited<ReturnType<typeof getMembersByOrganizationIdentifier>>;

const MembersTable = () => {
  const { organization } = useContext(OrganizationContext);
  const [columns, setColumns] = useColumns();
  const navigate = useNavigate();
  const search = useSearch({
    from: MembersTableRoute.id,
  });

  const [rows, setRows] = useState<Member[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(
    search.sort && search.order ?
      [{
        columnKey: search.sort,
        direction: search.order === 'asc' ? 'ASC' : 'DESC',
      }] : [
        {
          columnKey: 'createdAt',
          direction: 'DESC',
        },
      ]);
  const [query, setQuery] = useState<MemberSearch['q']>(search.q);
  const [role, setRole] = useState<MemberSearch['role']>(search.role);

  const callback = (member?: Member) => {
    if (member) {
      const newPagesArray =
        queryResult.data?.pages.map((page, index) => {
          if (index === 0) {
            return {
              items: [member, ...page.items],
              total: page.total + 1,
            };
          }

          return page;
        }) ?? [];

      queryClient.setQueryData<InfiniteData<QueryData>>(['members', query, sortColumns, role, organization], (data) => {
        if (!data) {
          return;
        }

        return {
          pages: newPagesArray,
          pageParams: data.pageParams,
        };
      });

      queryClient.setQueryDefaults(['members'], {
        select: (data) => {
          const pages: InfiniteData<QueryData>['pages'] = data.pages;
          return {
            pages: pages.map((page, index) => {
              if (index === 0) {
                return page;
              }
              return {
                ...page,
                items: page.items.filter((item) => item.id !== member.id),
              };
            }),
            pageParams: data.pageParams,
          };
        },
      });
    }
  };

  const queryResult = useInfiniteQuery(
    {
      queryKey: ['members', organization.slug, query, sortColumns, role],
      initialPageParam: 0,
      queryFn: async ({ pageParam, signal }) => {
        const fetchedData = await getMembersByOrganizationIdentifier(
          organization.slug,
          {
            page: pageParam,
            q: query,
            sort: sortColumns[0]?.columnKey as MemberSearch['sort'],
            order: sortColumns[0]?.direction.toLowerCase() as MemberSearch['order'],
            role,
          },
          signal,
        );

        return fetchedData;
      },
      getNextPageParam: (_lastGroup, groups) => groups.length,
      refetchOnWindowFocus: false,
    }
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

  useEffect(() => {
    if (query) {
      navigate({
        params: {},
        search: (prev) => ({ ...prev, q: query }),
      });
    } else {
      navigate({
        params: {},
        search: (prev) => ({ ...prev, q: undefined }),
      });
    }
    if (sortColumns[0]) {
      navigate({
        params: {},
        search: (prev) => ({
          ...prev,
          sort: sortColumns[0].columnKey,
          order: sortColumns[0].direction.toLowerCase(),
        }),
      });
    } else {
      navigate({
        params: {},
        search: (prev) => ({ ...prev, sort: undefined, order: undefined }),
      });
    }
    if (role) {
      navigate({
        params: {},
        search: (prev) => ({
          ...prev,
          role,
        }),
      });
    } else {
      navigate({
        params: {},
        search: (prev) => ({ ...prev, role: undefined }),
      });
    }
  }, [query, sortColumns[0]?.columnKey, role]);

  return (
    <div className='space-y-4 h-full'>
      <Toolbar
        isFiltered={isFiltered}
        total={queryResult.data?.pages[0].total}
        isLoading={queryResult.isFetching}
        query={query}
        columns={columns}
        setColumns={setColumns}
        refetch={queryResult.refetch}
        setQuery={setQuery}
        callback={callback}
        onResetFilters={onResetFilters}
        organization={organization}
        role={role}
        selectedMembers={rows.filter((row) => selectedRows.has(row.id))}
        setRole={setRole}
      />
      <DataTable<Member>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          rowKeyGetter: (row) => row.id,
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
              <Bird className="w-32 h-32" />
              <div className="mt-6">No members yet</div>
            </>
          ),
        }}
      />
    </div>
  );
};

export default MembersTable;