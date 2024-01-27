import { InfiniteData, QueryKey, UseInfiniteQueryResult, useInfiniteQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ColumnFiltersState, SortingState, Table as TableType, VisibilityState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useEffect, useState } from 'react';
import { getOrganizations } from '~/api/api';

import { useTranslation } from 'react-i18next';
import { queryClient } from '~/router';
import { OrganizationsSearch, OrganizationsTableRoute } from '~/router/routeTree';
import { useUserStore } from '~/store/user';
import { Organization } from '~/types';
import CreateOrganizationForm from '../create-organization-form';
import { DataTable } from '../data-table';
import CountAndLoading from '../data-table/count-and-loading';
import { DataTableViewOptions } from '../data-table/options';
import { dialog } from '../dialoger/state';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useColumns } from './columns';

type QueryData = Awaited<ReturnType<typeof getOrganizations>>;

interface CustomDataTableToolbarProps {
  table: TableType<Organization>;
  filter?: string;
  queryResult: UseInfiniteQueryResult<
    InfiniteData<
      {
        items: Organization[];
        total: number;
      },
      unknown
    >,
    Error
  >;
  rowSelection: Record<string, boolean>;
  isFiltered?: boolean;
  callback: (organization: Organization, action: 'create' | 'update' | 'delete') => void;
}

export function CustomDataTableToolbar({
  table,
  queryResult,
  // rowSelection,
  isFiltered,
  filter = 'name',
  callback,
}: CustomDataTableToolbarProps) {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);
  // const [, setOpen] = useState(false);

  return (
    <div className="items-center justify-between sm:flex">
      <div className="flex items-center space-x-2">
        {/* {Object.keys(rowSelection).length > 0 ? (
          <Button variant="destructive" className="relative" onClick={() => setOpen(true)}>
            <div className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-black px-1">
              <span className="text-xs font-medium text-white">{Object.keys(rowSelection).length}</span>
            </div>
            {t('action.remove', {
              defaultValue: 'Remove',
            })}
          </Button>
        ) : (
          user.role === 'ADMIN' && <SheetMenuCreate show entityType="organizations" text="Create" />
        )} */}
        {user.role === 'ADMIN' && (
          <Button
            onClick={() => {
              dialog(<CreateOrganizationForm callback={(organization) => callback(organization, 'create')} dialog />, {
                className: 'sm:max-w-xl',
                title: t('label.create_organization', {
                  defaultValue: 'Create organization',
                }),
              });
            }}
          >
            {t('action.create', {
              defaultValue: 'Create',
            })}
          </Button>
        )}
        <CountAndLoading
          count={queryResult.data?.pages[0].total}
          isLoading={queryResult.isFetching}
          singular={t('label.singular_organization', {
            defaultValue: 'organization',
          })}
          plural={t('label.plural_organization', {
            defaultValue: 'organizations',
          })}
          isFiltered={isFiltered}
          onResetFilters={() => {
            table.resetColumnFilters();
            table.resetRowSelection();
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
        <DataTableViewOptions table={table} />
        {/* {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-10 px-2 lg:px-3"
          >
            {t('action.reset', {
              defaultValue: 'Reset',
            })}
            <X className="ml-2 h-4 w-4" />
          </Button>
        )} */}
      </div>
    </div>
  );
}

const OrganizationsTable = () => {
  const search = useSearch({
    from: OrganizationsTableRoute.id,
  });
  const navigate = useNavigate();
  const [flatData, setFlatData] = useState<Organization[]>([]);
  const [rowSelection, setRowSelection] = useState({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    search.q
      ? [
          {
            id: 'name',
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

  const callback = (organization: Organization, action: 'create' | 'update' | 'delete') => {
    queryClient.setQueryData<InfiniteData<QueryData>>(['organizations', columnFilters, sorting], (data) => {
      if (!data) {
        return;
      }
      if (action === 'create') {
        return {
          pages: [
            {
              items: [organization, ...data.pages[0].items],
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
                if (item.id === organization.id) {
                  return organization;
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
              items: data.pages[0].items.filter((item) => item.id !== organization.id),
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
    queryKey: ['organizations', columnFilters, sorting],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const fetchedData = await getOrganizations(
        {
          page: pageParam,
          q: columnFilters[0]?.value as string | undefined,
          sort: sorting[0]?.id as 'name' | 'id' | 'createdAt' | 'userRole' | undefined,
          order: sorting[0]?.desc ? 'desc' : 'asc',
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
    manualFiltering: true,
    manualSorting: true,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  });

  const isFiltered = table.getState().columnFilters.length > 0;

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
          q: columnFilters[0].value as OrganizationsSearch['q'],
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
          sort: sorting[0].id as OrganizationsSearch['sort'],
          order: sorting[0].desc ? 'desc' : 'asc',
        }),
      });
    } else {
      navigate({
        params: {},
        search: (prev) => ({ ...prev, sort: undefined, order: undefined }),
      });
    }
  }, [columnFilters, sorting[0]]);

  return (
    <DataTable
      {...{
        queryResult,
        table,
        isFiltered,
        onResetFilters: () => {
          table.resetColumnFilters();
          table.resetRowSelection();
        },
        CustomToolbarComponent: (
          <CustomDataTableToolbar table={table} callback={callback} isFiltered={isFiltered} queryResult={queryResult} rowSelection={rowSelection} />
        ),
      }}
    />
  );
};

export default OrganizationsTable;
