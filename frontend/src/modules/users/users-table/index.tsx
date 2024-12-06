import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { SortColumn } from 'react-data-grid';
import type { z } from 'zod';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { getInitialSortColumns } from '~/modules/common/data-table/sort-columns';

import { useSearch } from '@tanstack/react-router';
import { config } from 'config';
import { useMutateQueryData } from '~/hooks/use-mutate-query-data';
import { openUserPreviewSheet } from '~/modules/common/data-table/util';
import type { usersQuerySchema } from '#/modules/users/schema';

import { useColumns } from '~/modules/users/users-table/columns';
import { UsersTableHeader } from '~/modules/users/users-table/table-header';
import { UsersTableRoute } from '~/routes/system';
import type { BaseTableMethods } from '~/types/common';

const BaseUsersTable = lazy(() => import('~/modules/users/users-table/table'));
const LIMIT = config.requestLimits.users;

export type UsersSearch = z.infer<typeof usersQuerySchema>;
export type UsersTableMethods = BaseTableMethods & {
  openInviteDialog: (container: HTMLElement | null) => void;
};

const UsersTable = () => {
  const search = useSearch({ from: UsersTableRoute.id });

  // Table state
  const [q, setQuery] = useState<UsersSearch['q']>(search.q);
  const [role, setRole] = useState<UsersSearch['role']>(search.role);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // Search query options
  const sort = sortColumns[0]?.columnKey as UsersSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as UsersSearch['order'];
  const limit = LIMIT;

  // Save filters in search params
  const filters = useMemo(() => ({ q, sort, order, role }), [q, role, order, sort]);
  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

  const mutateQuery = useMutateQueryData(['users', 'list'], (item) => ['user', item.id], ['update']);

  // Build columns
  const [columns, setColumns] = useColumns(mutateQuery.update);

  const tableId = 'users-table';
  const dataTableRef = useRef<UsersTableMethods | null>(null);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  const openInviteDialog = (container: HTMLElement | null) => {
    if (dataTableRef.current) dataTableRef.current.openInviteDialog(container);
  };

  const openRemoveDialog = () => {
    if (dataTableRef.current) dataTableRef.current.openRemoveDialog();
  };

  // TODO: Figure out a way to open sheet using url state
  useEffect(() => {
    if (!search.userIdPreview) return;
    setTimeout(() => openUserPreviewSheet(search.userIdPreview as string), 0);
  }, []);

  return (
    <div className="flex flex-col gap-4 h-full">
      <UsersTableHeader
        tableId={tableId}
        q={q ?? ''}
        setQuery={setQuery}
        role={role}
        setRole={setRole}
        columns={columns}
        setColumns={setColumns}
        clearSelection={clearSelection}
        openRemoveDialog={openRemoveDialog}
        openInviteDialog={openInviteDialog}
      />
      <Suspense>
        <BaseUsersTable
          ref={dataTableRef}
          tableId={tableId}
          columns={columns}
          sortColumns={sortColumns}
          setSortColumns={setSortColumns}
          queryVars={{
            q,
            role,
            sort,
            order,
            limit,
          }}
        />
      </Suspense>
    </div>
  );
};

export default UsersTable;
