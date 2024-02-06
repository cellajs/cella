import { InfiniteData, UseSuspenseInfiniteQueryResult, useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ColumnFiltersState, SortingState, Table as TableType, VisibilityState, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { GetMembersParams, getMembersByOrganizationIdentifier } from '~/api/organizations';
import { Member, Organization } from '~/types';

import { DataTable } from '~/modules/common/data-table';
import { DataTableViewOptions } from '~/modules/common/data-table/options';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';

import { Bird } from 'lucide-react';
import { cn } from '~/lib/utils';
import { OrganizationContext } from '~/modules/organizations/organization';
import { queryClient } from '~/router';
import { MemberSearch, MembersTableRoute, membersQueryOptions } from '~/router/routeTree';
import { useUserStore } from '~/store/user';
import InviteUsersForm from '../../users/invite-users-form';
import CountAndLoading from '../data-table/count-and-loading';
import { dialog } from '../dialoger/state';
import { useColumns } from './columns';
import RemoveMembersForm from './remove-member-form';

type QueryData = Awaited<ReturnType<typeof getMembersByOrganizationIdentifier>>;

interface CustomDataTableToolbarProps {
  table: TableType<Member>;
  queryResult: UseSuspenseInfiniteQueryResult<
    InfiniteData<
      {
        items: Member[];
        total: number;
      },
      unknown
    >,
    Error
  >;
  filter?: string;
  organization: Organization;
  role: GetMembersParams['role'];
  rowSelection: Record<string, boolean>;
  callback: (member?: Member) => void;
  isFiltered?: boolean;
  setRole: React.Dispatch<React.SetStateAction<GetMembersParams['role']>>;
}

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
    key: 'member',
    value: 'Member',
  },
];

export function CustomDataTableToolbar({
  table,
  queryResult,
  role,
  setRole,
  organization,
  callback,
  rowSelection,
  isFiltered,
  filter = 'name',
}: CustomDataTableToolbarProps) {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);
  const members = useMemo(() => Object.keys(rowSelection).map((id) => table.getRow(id).original), [rowSelection, table]);

  const openInviteDialog = () => {
    dialog(<InviteUsersForm organization={organization} callback={callback} dialog />, {
      drawerOnMobile: false,
      className: 'max-w-xl',
      title: t('label.invite', {
        defaultValue: 'Invite',
      }),
      description: t('description.invite_members', {
        defaultValue: 'Invited members will receive an email with invitation link.',
      }),
    });
  };

  const openRemoveDialog = () => {
    dialog(
      <RemoveMembersForm
        organization={organization}
        dialog
        callback={() => {
          table.resetRowSelection();
          queryResult.refetch();
        }}
        members={members}
      />,
      {
        className: 'sm:max-w-xl',
        title: t('label.remove_member', {
          defaultValue: 'Remove member',
        }),
        description: (
          <Trans
            i18nKey="question.are_you_sure_to_remove_member"
            values={{
              emails: members.map((member) => member.email).join(', '),
            }}
            defaults="Are you sure you want to remove <strong>{{emails}}</strong> from the organization?"
          />
        ),
      },
    );
  };

  return (
    <div className="items-center justify-between sm:flex">
      <div className="flex items-center space-x-2">
        {Object.keys(rowSelection).length > 0 ? (
          <>
            <Button variant="destructive" className="relative" onClick={openRemoveDialog}>
              <div className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-black px-1">
                <span className="text-xs font-medium text-white">{Object.keys(rowSelection).length}</span>
              </div>
              {t('action.remove', {
                defaultValue: 'Remove',
              })}
            </Button>
            <Button variant="secondary" onClick={openRemoveDialog}>
              {t('action.clear', {
                defaultValue: 'Clear',
              })}
            </Button>
          </>
        ) : (
          !isFiltered && (
            <>
              {(user.role === 'ADMIN' || organization.userRole === 'ADMIN') && (
                <Button onClick={openInviteDialog}>
                  {t('action.invite', {
                    defaultValue: 'Invite',
                  })}
                </Button>
              )}
            </>
          )
        )}
        {Object.keys(rowSelection).length === 0 && (
          <CountAndLoading
            count={queryResult.data?.pages[0].total}
            isLoading={queryResult.isFetching}
            singular={t('label.singular_member', {
              defaultValue: 'member',
            })}
            plural={t('label.plural_member', {
              defaultValue: 'members',
            })}
            isFiltered={isFiltered}
            onResetFilters={() => {
              table.resetColumnFilters();
              table.resetRowSelection();
              setRole(undefined);
            }}
          />
        )}
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
            setRole(role === 'all' ? undefined : (role as GetMembersParams['role']));
          }}
          value={role === undefined ? 'all' : role}
        >
          <SelectTrigger className={cn('h-10 w-[125px]', role !== undefined && 'text-primary')}>
            <SelectValue placeholder="Select a role" />
          </SelectTrigger>
          <SelectContent>
            {items.map(({ key, value }) => (
              <SelectItem key={key} value={key}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        CustomToolbarComponent: (
          <CustomDataTableToolbar
            table={table}
            filter={'email'}
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
