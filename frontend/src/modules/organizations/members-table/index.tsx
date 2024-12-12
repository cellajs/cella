import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { SortColumn } from 'react-data-grid';
import type { z } from 'zod';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { getInitialSortColumns } from '~/modules/common/data-table/sort-columns';
import type { membersQuerySchema } from '#/modules/general/schema';

import { useSearch } from '@tanstack/react-router';
import { config } from 'config';
import { Trans, useTranslation } from 'react-i18next';
import { getMembers } from '~/api/memberships';
import { openUserPreviewSheet } from '~/modules/common/data-table/util';
import { dialog } from '~/modules/common/dialoger/state';
import { useColumns } from '~/modules/organizations/members-table/columns';
import RemoveMembersForm from '~/modules/organizations/members-table/remove-member-form';
import { MembersTableHeader } from '~/modules/organizations/members-table/table-header';
import InviteUsers from '~/modules/users/invite-users';
import type { BaseTableMethods, EntityPage, Member, MinimumMembershipInfo } from '~/types/common';
import { arraysHaveSameElements } from '~/utils';

const BaseMembersTable = lazy(() => import('~/modules/organizations/members-table/table'));
const LIMIT = config.requestLimits.members;

export type MemberSearch = z.infer<typeof membersQuerySchema>;
export interface MembersTableProps {
  entity: EntityPage & { membership: MinimumMembershipInfo | null };
  isSheet?: boolean;
}

const MembersTable = ({ entity, isSheet = false }: MembersTableProps) => {
  const { t } = useTranslation();
  const search = useSearch({ strict: false });
  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // Table state
  const [q, setQuery] = useState<MemberSearch['q']>(search.q);
  const [role, setRole] = useState<MemberSearch['role']>(search.role as MemberSearch['role']);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // State for selected and total counts
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Member[]>([]);

  // Update total and selected counts
  const updateCounts = (newSelected: Member[], newTotal: number) => {
    if (newTotal !== total) setTotal(newTotal);
    if (!arraysHaveSameElements(selected, newSelected)) setSelected(newSelected);
  };

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

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  const openInviteDialog = (container?: HTMLElement | null) => {
    dialog(<InviteUsers entity={entity} mode={null} dialog />, {
      id: `user-invite-${entity.id}`,
      drawerOnMobile: false,
      className: 'w-auto shadow-none relative z-[60] max-w-4xl',
      container,
      containerBackdrop: true,
      containerBackdropClassName: 'z-50',
      title: t('common:invite'),
      description: `${t('common:invite_users.text')}`,
    });
  };

  const openRemoveDialog = () => {
    dialog(<RemoveMembersForm organizationId={organizationId} entityIdOrSlug={entity.slug} entityType={entity.entity} dialog members={selected} />, {
      className: 'max-w-xl',
      title: t('common:remove_resource', { resource: t('common:member').toLowerCase() }),
      description: (
        <Trans
          i18nKey="common:confirm.remove_members"
          values={{
            entity: entity.entity,
            emails: selected.map((member) => member.email).join(', '),
          }}
        />
      ),
    });
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
        entity={entity}
        total={total}
        selected={selected}
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
        isSheet={isSheet}
      />
      <Suspense>
        <BaseMembersTable
          entity={entity}
          ref={dataTableRef}
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
          updateCounts={updateCounts}
        />
      </Suspense>
    </div>
  );
};

export default MembersTable;
