import { useRef } from 'react';
import { MembersTableFilterBar } from '~/modules/organizations/members-table/filter-bar';
import { BaseMembersTable } from '~/modules/organizations/members-table/table';
import type { EntityPage, MinimumMembershipInfo } from '~/types/common';

export interface MembersTableMethods {
  clearSelection: () => void;
  openInviteDialog: () => void;
  openRemoveDialog: () => void;
}

const MembersTable = ({ entity }: { entity: EntityPage & { membership: MinimumMembershipInfo | null } }) => {
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
      tableFilterBar={
        <MembersTableFilterBar
          entity={entity}
          clearSelection={clearSelection}
          openInviteDialog={openInviteDialog}
          openRemoveDialog={openRemoveDialog}
        />
      }
    />
  );
};

export default MembersTable;
