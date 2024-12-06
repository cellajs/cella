import { Suspense, lazy, useRef } from 'react';
import type { z } from 'zod';
import { useColumns } from '~/modules/system/requests-table/columns';
import { RequestsTableHeaderBar } from '~/modules/system/requests-table/table-header';
import type { BaseTableMethods } from '~/types/common';
import type { getRequestsQuerySchema } from '#/modules/requests/schema';

export type RequestsSearch = z.infer<typeof getRequestsQuerySchema>;

export type RequestsTableMethods = BaseTableMethods & {
  openInviteDialog: () => void;
};

const BaseRequestsTable = lazy(() => import('~/modules/system/requests-table/table'));

const RequestsTable = () => {
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

  // Build columns
  const [columns, setColumns] = useColumns();

  return (
    <div className="flex flex-col gap-4 h-full">
      <RequestsTableHeaderBar
        tableId={tableId}
        clearSelection={clearSelection}
        openRemoveDialog={openRemoveDialog}
        openInviteDialog={openInviteDialog}
        columns={columns}
        setColumns={setColumns}
      />
      <Suspense>
        <BaseRequestsTable tableId={tableId} columns={columns} />
      </Suspense>
    </div>
  );
};

export default RequestsTable;
