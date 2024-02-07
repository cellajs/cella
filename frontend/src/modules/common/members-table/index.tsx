import { InfiniteData, useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ColumnFiltersState, SortingState, VisibilityState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useContext, useEffect, useState } from 'react';
import { GetMembersParams, getMembersByOrganizationIdentifier } from '~/api/organizations';
import { Member } from '~/types';

import { DataTable } from '~/modules/common/data-table';

import { Bird } from 'lucide-react';
import { OrganizationContext } from '~/modules/organizations/organization';
import { queryClient } from '~/router';
import { MemberSearch, MembersTableRoute, membersQueryOptions } from '~/router/routeTree';
import { useColumns } from './columns';
import Toolbar from './toolbar';

type QueryData = Awaited<ReturnType<typeof getMembersByOrganizationIdentifier>>;

const MembersTable = () => {
  const { organization } = useContext(OrganizationContext);
  const columns = useColumns();
  const navigate = useNavigate();
  const [flatData, setFlatData] = useState<Member[]>([]);
  const [rowSelection, setRowSelection] = useState({});
  const search = useSearch({
    from: MembersTableRoute.id,
  });
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    search.q
      ? [
        {
          id: 'email',
          value: search.q,
        },
      ]
      : [],
  );
  const [sorting, setSorting] = useState<SortingState>(
    search.sort
      ? [
        {
          id: search.sort,
          desc: search.order === 'desc',
        },
      ]
      : [],
  );
  const [role, setRole] = useState<GetMembersParams['role']>(search.role ? (search.role as GetMembersParams['role']) : undefined);

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

      queryClient.setQueryData<InfiniteData<QueryData>>(['members', columnFilters, sorting, role, organization], (data) => {
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

  const queryResult = useSuspenseInfiniteQuery(
    membersQueryOptions({
      organizationIdentifier: organization.slug,
      q: columnFilters[0]?.value as MemberSearch['q'],
      sort: sorting[0]?.id as MemberSearch['sort'],
      order: sorting[0]?.desc ? 'desc' : 'asc',
      role,
    }),
  );

  const table = useReactTable({
    data: flatData,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    manualFiltering: true,
    manualSorting: true,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  });

  const isFiltered = role !== undefined || table.getState().columnFilters.length > 0;

  useEffect(() => {
    const data = queryResult.data?.pages?.flatMap((page) => page.items);

    if (data) {
      setFlatData(data);
    }
  }, [queryResult.data]);

  useEffect(() => {
    if (columnFilters[0]) {
      navigate({
        params: {},
        search: (prev) => ({ ...prev, q: columnFilters[0].value as MemberSearch['q'] }),
      });
    } else {
      navigate({
        params: {},
        search: (prev) => ({ ...prev, q: undefined }),
      });
    }
    if (sorting[0]) {
      navigate({
        params: {},
        search: (prev) => ({
          ...prev,
          sort: sorting[0].id as MemberSearch['sort'],
          order: sorting[0].desc ? 'desc' : 'asc',
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
  }, [columnFilters, sorting, role, navigate]);

  return (
    <DataTable
      {...{
        // className: 'h-[500px]',
        table,
        queryResult,
        overflowNoRows: true,
        isFiltered,
        onResetFilters: () => {
          table.resetColumnFilters();
          table.resetRowSelection();
          setRole(undefined);
        },
        NoRowsComponent: (
          <>
            <Bird className="w-32 h-32" />
            <div className="mt-6">No members yet</div>
          </>
        ),
        ToolbarComponent: (
          <Toolbar
            table={table}
            queryResult={queryResult}
            isFiltered={isFiltered}
            callback={callback}
            organization={organization}
            role={role}
            rowSelection={rowSelection}
            setRole={setRole}
          />
        ),
      }}
    />
  );
};

export default MembersTable;