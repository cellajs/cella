import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { SortColumn } from 'react-data-grid';
import type { z } from 'zod';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { getInitialSortColumns } from '~/modules/common/data-table/sort-columns';
import type { membersQuerySchema } from '#/modules/general/schema';

import { useSearch } from '@tanstack/react-router';
import { config } from 'config';
import { getMembers } from '~/api/memberships';
import { openUserPreviewSheet } from '~/modules/common/data-table/util';
import { useColumns } from '~/modules/organizations/members-table/columns';
import { MembersTableHeader } from '~/modules/organizations/members-table/table-header';
import type { BaseTableMethods, EntityPage, MinimumMembershipInfo } from '~/types/common';

const BaseMembersTable = lazy(() => import('~/modules/organizations/members-table/table'));
const LIMIT = config.requestLimits.members;

export type MemberSearch = z.infer<typeof membersQuerySchema>;
export type MembersTableMethods = BaseTableMethods & {
  openInviteDialog: (container?: HTMLElement | null) => void;
};
export interface MembersTableProps {
  entity: EntityPage & { membership: MinimumMembershipInfo | null };
  isSheet?: boolean;
}

const MembersTable = ({ entity, isSheet = false }: MembersTableProps) => {
  const search = useSearch({ strict: false });

  // Table state
  const [q, setQuery] = useState<MemberSearch['q']>(search.q);
  const [role, setRole] = useState<MemberSearch['role']>(search.role as MemberSearch['role']);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // Search query options
  const sort = sortColumns[0]?.columnKey as MemberSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as MemberSearch['order'];
  const limit = LIMIT;

  // Save filters in search params
  if (!isSheet) {
    const filters = useMemo(() => ({ q, role, sort, order }), [q, role, sortColumns]);
    useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });
  }

  const organizationId = entity.organizationId || entity.id;
  const isAdmin = entity.membership?.role === 'admin';

  // Build columns
  const [columns, setColumns] = useColumns(isAdmin, isSheet, organizationId);

  const tableId = `members-table-${entity.id}`;
  const dataTableRef = useRef<MembersTableMethods | null>(null);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  const openInviteDialog = (container?: HTMLElement | null) => {
    if (dataTableRef.current) dataTableRef.current.openInviteDialog(container);
  };

  const openRemoveDialog = () => {
    if (dataTableRef.current) dataTableRef.current.openRemoveDialog();
  };

  const fetchExport = async (limit: number) => {
    const { items } = await getMembers({
      q,
      sort,
      order,
      role,
      limit,
      idOrSlug: entity.slug,
      orgIdOrSlug: organizationId,
      entityType: entity.entity,
    });
    return items;
  };

  // TODO: Figure out a way to open sheet using url state
  useEffect(() => {
    if (!search.userIdPreview) return;
    setTimeout(() => openUserPreviewSheet(search.userIdPreview as string, organizationId), 0);
  }, []);

  return (
    <div className="flex flex-col gap-4 h-full">
      <MembersTableHeader
        tableId={tableId}
        entity={entity}
        q={q ?? ''}
        setQuery={setQuery}
        role={role}
        setRole={setRole}
        columns={columns}
        setColumns={setColumns}
        fetchExport={fetchExport}
        clearSelection={clearSelection}
        openRemoveDialog={openRemoveDialog}
        openInviteDialog={openInviteDialog}
      />
      <Suspense>
        <BaseMembersTable
          entity={entity}
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

export default MembersTable;
