import { useRef } from 'react';
import type { z } from 'zod';
import { RequestsTableFilterBar } from '~/modules/system/requests-table/filter-bar';
import { BaseRequestsTable } from '~/modules/system/requests-table/table';
import type { BaseTableMethods } from '~/types/common';
import type { getRequestsQuerySchema } from '#/modules/requests/schema';

export type RequestsSearch = z.infer<typeof getRequestsQuerySchema>;

export type RequestsTableMethods = BaseTableMethods & {
  openInviteDialog: () => void;
};

const RequestsTable = () => {
  console.log(24);
  const tableId = 'requests-table';
  const dataTableRef = useRef<RequestsTableMethods | null>(null);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  const openRemoveDialog = () => {
    if (dataTableRef.current) dataTableRef.current.openRemoveDialog();
  };

  const openInviteDialog = () => {
    if (dataTableRef.current) dataTableRef.current.openInviteDialog();
  };

  return (
    <BaseRequestsTable
      ref={dataTableRef}
      tableId={tableId}
      tableFilterBar={
        <RequestsTableFilterBar
          tableId={tableId}
          clearSelection={clearSelection}
          openRemoveDialog={openRemoveDialog}
          openInviteDialog={openInviteDialog}
        />
      }
    />
  );
};

export default RequestsTable;
