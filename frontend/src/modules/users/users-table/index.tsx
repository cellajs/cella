import { type InfiniteData, type UseInfiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';
import { useParams, useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GetMembersParams } from '~/api/general';
import { updateUser, type UpdateUserParams, type GetUsersParams } from '~/api/users';

import type { getMembersQuerySchema } from 'backend/modules/general/schema';
import type { getUsersQuerySchema } from 'backend/modules/users/schema';
import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useDebounce } from '~/hooks/use-debounce';
import { useMutateInfiniteQueryData } from '~/hooks/use-mutate-query-data';
import { DataTable } from '~/modules/common/data-table';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import { dialog } from '~/modules/common/dialoger/state';
import InviteUsers from '~/modules/users/invite-users';
import RemoveMembersForm from '~/modules/users/users-table/remove-member-form';
import type { ContextEntity, Member, User } from '~/types';
import useSaveInSearchParams from '../../../hooks/use-save-in-search-params';
import DeleteUsers from '../delete-users';
import { useColumns } from './columns';
import Toolbar from './toolbar';
import type { config } from 'config';
import { useMutation } from '~/hooks/use-mutations';
import { updateMembership } from '~/api/memberships';

export const LIMIT = 40;

export type queryOptions<T> = {
  items: T[];
  total: number;
};
// Users table renders members when entityType is provided, defaults to users in the system
interface Props<T, U> {
  entityType?: ContextEntity;
  queryOptions: (
    values: U,
  ) => UseInfiniteQueryOptions<queryOptions<T>, Error, InfiniteData<queryOptions<T>, unknown>, queryOptions<T>, (string | undefined)[], number>;
  routeFrom: '/layout/$idOrSlug/members' | '/layout/system/users';
  customColumns?: ColumnOrColumnGroup<T>[];
  fetchForExport?: (values: U) => Promise<queryOptions<T>>;
}

export const isMember = (resource: User | Member): resource is Member => {
  return (resource as Member).membershipId !== undefined;
};

const UsersTable = <
  T extends Member | User,
  U extends GetUsersParams | GetMembersParams,
  K extends z.infer<typeof getMembersQuerySchema> | z.infer<typeof getUsersQuerySchema>,
>({
  entityType,
  queryOptions,
  routeFrom,
  customColumns,
  fetchForExport,
}: Props<T, U>) => {
  // Save filters in search params
  const search = useSearch({ from: routeFrom });
  const props = useParams({ from: routeFrom });
  const { t } = useTranslation();
  const idOrSlug = 'idOrSlug' in props ? props.idOrSlug : undefined;
  const containerRef = useRef(null);

  const [rows, setRows] = useState<T[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [query, setQuery] = useState<K['q']>(search.q);
  const [role, setRole] = useState<K['role']>(search.role);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(
    search.sort && search.order
      ? [{ columnKey: search.sort, direction: search.order === 'asc' ? 'ASC' : 'DESC' }]
      : [{ columnKey: 'createdAt', direction: 'DESC' }],
  );

  const debounceQuery = useDebounce(query, 300);

  // Save filters in search params
  const filters = useMemo(
    () => ({
      q: debounceQuery,
      sort: sortColumns[0]?.columnKey,
      order: sortColumns[0]?.direction.toLowerCase(),
      role,
    }),
    [debounceQuery, role, sortColumns],
  );

  const { mutate: updateEntityRole } = useMutation({
    mutationFn: (values: { membershipId: string; role?: (typeof config.rolesByType.entityRoles)[number] }) => {
      return updateMembership(values);
    },
    onSuccess: () => toast.success('Role updated successfully'),
    onError: () => toast.error('Error updating role'),
  });

  const { mutate: updateSystemRole } = useMutation({
    mutationFn: (values: { userId: string; params: UpdateUserParams }) => {
      return updateUser(values.userId, values.params);
    },
    onSuccess: () => toast.success('Role updated successfully'),
    onError: () => toast.error('Error updating role'),
  });

  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });
  const callback = useMutateInfiniteQueryData(['users', debounceQuery, sortColumns, role]);

  const openInviteDialog = () => {
    dialog(<InviteUsers entityId={idOrSlug} entityType={entityType} mode={idOrSlug ? null : 'email'} dialog />, {
      id: 'user-invite',
      drawerOnMobile: false,
      className: 'w-auto shadow-none relative z-[100] max-w-4xl',
      container: containerRef.current,
      title: t('common:invite'),
      text: `${t('common:invite_users.text')}`,
    });
  };

  const openDeleteDialog = () => {
    dialog(
      idOrSlug ? (
        <RemoveMembersForm
          entityId={idOrSlug}
          entityType={entityType}
          dialog
          callback={(members) => {
            callback(members, 'delete');
            toast.success(t('common:success.delete_members'));
          }}
          members={rows.filter((row) => selectedRows.has(row.id)) as Member[]}
        />
      ) : (
        <DeleteUsers
          dialog
          users={rows.filter((row) => selectedRows.has(row.id)) as User[]}
          callback={(users) => {
            callback(users, 'delete');
            toast.success(t('success.delete_resources', { resources: t('common:users') }));
          }}
        />
      ),
      {
        drawerOnMobile: false,
        className: 'max-w-xl',
        title: idOrSlug ? t('common:delete') : t('common:remove_member'),
        text: idOrSlug ? (
          t('common:confirm.delete_resource', { resource: t('common:users').toLowerCase() })
        ) : (
          <Trans
            i18nKey="common:confirm.remove_members"
            values={{
              emails: rows
                .filter((row) => selectedRows.has(row.id))
                .map((member) => member.email)
                .join(', '),
            }}
          />
        ),
      },
    );
  };

  const queryResult = useInfiniteQuery(
    queryOptions({
      ...(idOrSlug && { idOrSlug }),
      q: debounceQuery,
      sort: sortColumns[0]?.columnKey as K['sort'],
      order: sortColumns[0]?.direction.toLowerCase() as K['order'],
      role,
      limit: LIMIT,
    } as U),
  );
  const [columns, setColumns] = useColumns(callback, customColumns);

  const isFiltered = role !== undefined || !!debounceQuery;

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
    setRole(undefined);
  };

  const onRowsChange = (changedRows: T[], { indexes, column }: RowsChangeData<T>) => {
    // mutate member
    for (const index of indexes) {
      if (column.key === 'role') {
        const user = changedRows[index];
        if (isMember(user)) return updateEntityRole({ membershipId: user.membershipId, role: user.role });
        return updateSystemRole({ userId: user.id, params: { role: user.role } });
      }
    }
    setRows(changedRows);
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
      <Toolbar<T>
        entityType={entityType}
        isFiltered={isFiltered}
        total={queryResult.data?.pages[0].total}
        query={query}
        setQuery={setQuery}
        onResetFilters={onResetFilters}
        onResetSelectedRows={() => setSelectedRows(new Set<string>())}
        role={role}
        selectedUsers={rows.filter((row) => selectedRows.has(row.id)) as T[]}
        setRole={setRole}
        columns={columns}
        setColumns={setColumns}
        inviteDialog={openInviteDialog}
        removeDialog={openDeleteDialog}
        fetchForExport={
          fetchForExport
            ? (limit) => {
                return fetchForExport({
                  entityType,
                  idOrSlug,
                  limit,
                  q: query,
                  sort: sortColumns[0]?.columnKey,
                  order: sortColumns[0]?.direction.toLowerCase(),
                } as U);
              }
            : null
        }
      />
      <div ref={containerRef} />
      <DataTable<T>
        {...{
          columns: columns.filter((column) => column.visible),
          rowHeight: 42,
          enableVirtualization: false,
          onRowsChange,
          rows,
          limit: LIMIT,
          totalCount: queryResult.data?.pages[0].total,
          rowKeyGetter: (row) => row.id,
          error: queryResult.error,
          isLoading: queryResult.isLoading,
          isFetching: queryResult.isFetching,
          fetchMore: queryResult.fetchNextPage,
          isFiltered,
          selectedRows,
          onSelectedRowsChange: setSelectedRows,
          sortColumns,
          onSortColumnsChange: setSortColumns,
        }}
      />
    </div>
  );
};

export default UsersTable;
