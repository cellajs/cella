import { InfiniteData, QueryKey, UseInfiniteQueryResult, useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  ColumnFiltersState,
  Row,
  SortingState,
  Table as TableType,
  VisibilityState,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useEffect, useState } from 'react';

import { GetUsersParams, getUserBySlugOrId, getUsers } from '~/api/users';
import { User } from '~/types';

import { Loader2, X } from 'lucide-react';

import { useTranslation } from 'react-i18next';
import { DataTable } from '~/components/data-table';
import { Button } from '~/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { dateShort } from '~/lib/utils';
import { queryClient } from '~/router';
import { UsersSearch, UsersTableRoute } from '~/router/routeTree';
import CountAndLoading from '../data-table/count-and-loading';
import { DataTableViewOptions } from '../data-table/options';
import { Input } from '../ui/input';
import { useColumns } from './columns';

type QueryData = Awaited<ReturnType<typeof getUsers>>;

const items = [
  {
    key: 'all',
    value: 'All',
  },
  {
    key: 'admin',
    value: 'Admin',
  },
  {
    key: 'user',
    value: 'User',
  },
];

interface CustomDataTableToolbarProps {
  table: TableType<User>;
  filter?: string;
  queryResult: UseInfiniteQueryResult<
    InfiniteData<
      {
        items: User[];
        total: number;
      },
      unknown
    >,
    Error
  >;
  rowSelection: Record<string, boolean>;
  isFiltered?: boolean;
  role: GetUsersParams['role'];
  setRole: React.Dispatch<React.SetStateAction<GetUsersParams['role']>>;
}

export function CustomDataTableToolbar({
  table,
  queryResult,
  rowSelection,
  isFiltered,
  filter = 'name',
  role,
  setRole,
}: CustomDataTableToolbarProps) {
  const { t } = useTranslation();
  const [, setOpen] = useState(false);

  return (
    <div className="items-center justify-between sm:flex">
      <div className="flex items-center space-x-2">
        {Object.keys(rowSelection).length > 0 && (
          <Button variant="destructive" className="relative" onClick={() => setOpen(true)}>
            <div className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-black px-1">
              <span className="text-xs font-medium text-white">{Object.keys(rowSelection).length}</span>
            </div>
            {t('action.remove', {
              defaultValue: 'Remove',
            })}
          </Button>
        )}
        <CountAndLoading
          count={queryResult.data?.pages[0].total}
          isLoading={queryResult.isFetching}
          singular={t('label.singular_user', {
            defaultValue: 'user',
          })}
          plural={t('label.plural_users', {
            defaultValue: 'users',
          })}
          isFiltered={isFiltered}
          onResetFilters={() => {
            table.resetColumnFilters();
            table.resetRowSelection();
            setRole(undefined);
          }}
        />
      </div>
      <div className="mt-2 flex items-center space-x-2 sm:mt-0">
        <Input
          placeholder={t('placeholder.search', {
            defaultValue: 'Search ...',
          })}
          value={(table.getColumn(filter)?.getFilterValue() as string) ?? ''}
          onChange={(event) => {
            table.resetRowSelection();
            table.getColumn(filter)?.setFilterValue(event.target.value);
          }}
          className="h-10 w-[150px] lg:w-[250px]"
        />
        <Select
          onValueChange={(role) => {
            table.resetRowSelection();
            setRole(role === 'all' ? undefined : (role as GetUsersParams['role']));
          }}
          value={role === undefined ? 'all' : role}
        >
          <SelectTrigger className="h-10 w-[150px]">
            <SelectValue placeholder="Select a role" className="capitalize" />
          </SelectTrigger>
          <SelectContent>
            {items.map(({ key, value }) => (
              <SelectItem key={key} value={key} className="capitalize">
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DataTableViewOptions table={table} />

        {isFiltered && (
          <Button variant="ghost" onClick={() => table.resetColumnFilters()} className="h-10 px-2 lg:px-3">
            {t('action.reset', {
              defaultValue: 'Reset',
            })}
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// id, modified, modifiedBy
const SubComponent = ({ row }: { row: Row<User> }) => {
  const [modifier, setModifier] = useState<User | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!row.original.modifiedBy) {
      return;
    }

    setLoading(true);
    getUserBySlugOrId(row.original.modifiedBy)
      .then((user) => {
        setModifier(user);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [row.original.modifiedBy]);

  return (
    <div className="flex space-x-4">
      <div className="flex flex-col font-light space-y-2">
        <div className="flex space-x-2">
          <span className="font-medium">ID</span>
          <span>{row.original.id}</span>
        </div>
        <div className="flex space-x-2">
          <span className="font-medium">Modified</span>
          <span>{dateShort(row.original.modifiedAt)}</span>
        </div>
        <div className="flex space-x-2">
          <span className="font-medium">Modified By</span>
          {loading ? (
            <Loader2 className="animate-spin" />
          ) : modifier ? (
            <span>
              {modifier.name} ({modifier.email})
            </span>
          ) : (
            <span>Unknown</span>
          )}
        </div>
      </div>
    </div>
  );
};

const UsersTable = () => {
  const [flatData, setFlatData] = useState<User[]>([]);
  const navigate = useNavigate();
  const [rowSelection, setRowSelection] = useState({});
  const search = useSearch({ from: UsersTableRoute.id });
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
  const [role, setRole] = useState<GetUsersParams['role']>(search.role ? (search.role as GetUsersParams['role']) : undefined);

  const callback = (user: User, action: 'create' | 'update' | 'delete') => {
    queryClient.setQueryData<InfiniteData<QueryData>>(['users', columnFilters, sorting, role], (data) => {
      if (!data) {
        return;
      }
      if (action === 'create') {
        return {
          pages: [
            {
              items: [
                {
                  ...user,
                  membershipCount: 0,
                },
                ...data.pages[0].items,
              ],
              total: data.pages[0].total + 1,
            },
            ...data.pages.slice(1),
          ],
          pageParams: data.pageParams,
        };
      }

      if (action === 'update') {
        return {
          pages: [
            {
              items: data.pages[0].items.map((item) => {
                if (item.id === user.id) {
                  return {
                    ...user,
                    membershipCount: item.membershipCount,
                  };
                }

                return item;
              }),
              total: data.pages[0].total,
            },
            ...data.pages.slice(1),
          ],
          pageParams: data.pageParams,
        };
      }

      if (action === 'delete') {
        return {
          pages: [
            {
              items: data.pages[0].items.filter((item) => item.id !== user.id),
              total: data.pages[0].total - 1,
            },
            ...data.pages.slice(1),
          ],
          pageParams: data.pageParams,
        };
      }
    });
  };

  const queryResult = useInfiniteQuery<QueryData, Error, InfiniteData<QueryData>, QueryKey, number>({
    queryKey: ['users', columnFilters, sorting, role],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const fetchedData = await getUsers(
        {
          page: pageParam,
          q: columnFilters[0]?.value as string | undefined,
          sort: sorting[0]?.id as GetUsersParams['sort'],
          order: sorting[0]?.desc ? 'desc' : 'asc',
          role,
        },
        signal,
      );
      return fetchedData;
    },
    getNextPageParam: (_lastGroup, groups) => groups.length,
    refetchOnWindowFocus: false,
  });

  const columns = useColumns(callback);

  const table = useReactTable({
    data: flatData,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    getRowCanExpand: () => true,
    manualFiltering: true,
    manualSorting: true,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
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
        search: (prev) => ({
          ...prev,
          q: columnFilters[0].value as UsersSearch['q'],
        }),
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
          sort: sorting[0].id as UsersSearch['sort'],
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
  }, [columnFilters, sorting[0], role]);

  return (
    <DataTable<User>
      {...{
        // className: 'h-[500px]',
        table,
        queryResult,
        isFiltered,
        onResetFilters: () => {
          table.resetColumnFilters();
          table.resetRowSelection();
          setRole(undefined);
        },
        CustomToolbarComponent: (
          <CustomDataTableToolbar
            table={table}
            role={role}
            filter="email"
            setRole={setRole}
            isFiltered={isFiltered}
            queryResult={queryResult}
            rowSelection={rowSelection}
          />
        ),
        renderSubComponent: ({ row }) => <SubComponent row={row} />,
      }}
    />
  );
};

export default UsersTable;
