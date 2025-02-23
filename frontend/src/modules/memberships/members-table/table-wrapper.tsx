import { Suspense, lazy, useRef, useState } from 'react';

import type { z } from 'zod';

import { onlineManager } from '@tanstack/react-query';
import { config } from 'config';
import { Trans, useTranslation } from 'react-i18next';
import useSearchParams from '~/hooks/use-search-params';
import { useUserSheet } from '~/hooks/use-user-sheet';
import { queryClient } from '~/lib/router';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { BaseTableMethods } from '~/modules/common/data-table/types';
import { dialog } from '~/modules/common/dialoger/state';
import { toaster } from '~/modules/common/toaster';
import type { EntityPage } from '~/modules/general/types';
import { getMembers } from '~/modules/memberships/api';
import { useColumns } from '~/modules/memberships/members-table/columns';
import { MembersTableBar } from '~/modules/memberships/members-table/table-bar';
import RemoveMembersForm from '~/modules/memberships/remove-member-form';
import type { Member } from '~/modules/memberships/types';
import { organizationsKeys } from '~/modules/organizations/query';
import InviteUsers from '~/modules/users/invite-users';
import type { membersSearchSchema } from '~/routes/organizations';
import { arraysHaveSameElements } from '~/utils';

const BaseDataTable = lazy(() => import('~/modules/memberships/members-table/table'));

const LIMIT = config.requestLimits.members;

export type MemberSearch = z.infer<typeof membersSearchSchema>;
export interface MembersTableProps {
  entity: EntityPage;
  isSheet?: boolean;
}

const MembersTable = ({ entity: baseEntity, isSheet = false }: MembersTableProps) => {
  const { t } = useTranslation();

  const { search, setSearch } = useSearchParams<MemberSearch>({ saveDataInSearch: !isSheet });

  const dataTableRef = useRef<BaseTableMethods | null>(null);
  const organizationId = baseEntity.organizationId || baseEntity.id;
  const isAdmin = baseEntity.membership?.role === 'admin';

  const { q, role, sort, order, sheetId } = search;
  const limit = LIMIT;

  const [total, setTotal] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<Member[]>([]);
  const [entity, setEntity] = useState<EntityPage>(baseEntity);

  // Update total and selected counts
  const updateCounts = (newSelected: Member[], newTotal: number) => {
    if (newTotal !== total) setTotal(newTotal);
    if (!arraysHaveSameElements(selected, newSelected)) setSelected(newSelected);
  };

  // Build columns
  const [columns, setColumns] = useColumns(isAdmin, isSheet);
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  // Render user sheet if sheetId is present
  useUserSheet({ sheetId, organizationId });

  const openInviteDialog = (container?: HTMLElement | null) => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    dialog(<InviteUsers entity={entity} mode={null} dialog callback={handleNewInvites} />, {
      id: `user-invite-${entity.id}`,
      drawerOnMobile: false,
      className: 'w-auto shadow-none relative z-60 max-w-4xl',
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

  const handleNewInvites = () => {
    queryClient.setQueryData(organizationsKeys.single(entity.slug), (oldEntity: EntityPage) => {
      if (!oldEntity) return oldEntity;
      const newEntity = { ...oldEntity };
      // @ts-ignore TODO: Fix this
      newEntity.counts.membership.pending += 1;
      setEntity(newEntity);
      return newEntity;
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

  return (
    <div className="flex flex-col gap-4 h-full">
      <MembersTableBar
        entity={entity}
        total={total}
        selected={selected}
        q={q ?? ''}
        role={role}
        setSearch={setSearch}
        columns={columns}
        setColumns={setColumns}
        fetchExport={fetchExport}
        clearSelection={clearSelection}
        openRemoveDialog={openRemoveDialog}
        openInviteDialog={openInviteDialog}
        isSheet={isSheet}
      />
      <Suspense>
        <BaseDataTable
          entity={entity}
          ref={dataTableRef}
          columns={columns}
          queryVars={{ q, role, sort, order, limit }}
          updateCounts={updateCounts}
          sortColumns={sortColumns}
          setSortColumns={setSortColumns}
        />
      </Suspense>
    </div>
  );
};

export default MembersTable;
