import { useRef } from 'react';
import type { z } from 'zod';
import { MembersTableFilterBar } from '~/modules/organizations/members-table/filter-bar';
import { BaseMembersTable } from '~/modules/organizations/members-table/table';
import type { BaseTableMethods, EntityPage, MinimumMembershipInfo } from '~/types/common';
import type { membersQuerySchema } from '#/modules/general/schema';

export type MemberSearch = z.infer<typeof membersQuerySchema>;

export type MembersTableMethods = BaseTableMethods & {
  openInviteDialog: () => void;
};

export interface MembersTableProps {
  entity: EntityPage & { membership: MinimumMembershipInfo | null };
  isSheet?: boolean;
}

const MembersTable = ({ entity, isSheet = false }: MembersTableProps) => {
  const tableId = `members-table-${entity.id}`;
  const dataTableRef = useRef<MembersTableMethods | null>(null);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  const openInviteDialog = () => {
    if (dataTableRef.current) dataTableRef.current.openInviteDialog();
  };

  const openRemoveDialog = () => {
    if (dataTableRef.current) dataTableRef.current.openRemoveDialog();
  };

  return (
    <BaseMembersTable
      entity={entity}
      ref={dataTableRef}
      tableId={tableId}
      isSheet={isSheet}
      tableFilterBar={
        <MembersTableFilterBar
          entity={entity}
          tableId={tableId}
          clearSelection={clearSelection}
          openInviteDialog={openInviteDialog}
          openRemoveDialog={openRemoveDialog}
        />
      }
    />
  );
};

export default MembersTable;
