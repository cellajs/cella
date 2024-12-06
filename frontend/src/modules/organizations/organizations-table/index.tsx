import { Suspense, lazy, useRef } from 'react';
import type { z } from 'zod';
import { useMutateQueryData } from '~/hooks/use-mutate-query-data';
import type { getOrganizationsQuerySchema } from '#/modules/organizations/schema';

import type { BaseTableMethods } from '~/types/common';
import { useColumns } from './columns';
import { OrganizationsTableHeader } from './table-header';

export type OrganizationsSearch = z.infer<typeof getOrganizationsQuerySchema>;
export type OrganizationsTableMethods = BaseTableMethods & {
  openNewsletterSheet: () => void;
};

const BaseOrganizationsTable = lazy(() => import('~/modules/organizations/organizations-table/table'));

const OrganizationsTable = () => {
  const tableId = 'organizations-table';
  const dataTableRef = useRef<OrganizationsTableMethods | null>(null);
  const mutateQuery = useMutateQueryData(['organizations', 'list']);

  // Build columns
  const [columns, setColumns] = useColumns(mutateQuery.update);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  const openRemoveDialog = () => {
    if (dataTableRef.current) dataTableRef.current.openRemoveDialog();
  };

  const openNewsletterSheet = () => {
    if (dataTableRef.current) dataTableRef.current.openNewsletterSheet();
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <OrganizationsTableHeader
        tableId={tableId}
        columns={columns}
        setColumns={setColumns}
        clearSelection={clearSelection}
        openRemoveDialog={openRemoveDialog}
        openNewsletterSheet={openNewsletterSheet}
      />
      <Suspense>
        <BaseOrganizationsTable ref={dataTableRef} tableId={tableId} columns={columns} />
      </Suspense>
    </div>
  );
};

export default OrganizationsTable;
