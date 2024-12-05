import { useRef } from 'react';
import type { z } from 'zod';
import { OrganizationsTableFilterBar } from '~/modules/organizations/organizations-table/filter-bar';
import { BaseOrganizationsTable } from '~/modules/organizations/organizations-table/table';
import type { BaseTableMethods } from '~/types/common';
import type { getOrganizationsQuerySchema } from '#/modules/organizations/schema';

export type OrganizationsSearch = z.infer<typeof getOrganizationsQuerySchema>;

export type OrganizationsTableMethods = BaseTableMethods & {
  openNewsletterSheet: () => void;
};

const OrganizationsTable = () => {
  const tableId = 'organizations-table';
  const dataTableRef = useRef<OrganizationsTableMethods | null>(null);

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
    <BaseOrganizationsTable
      ref={dataTableRef}
      tableId={tableId}
      tableFilterBar={
        <OrganizationsTableFilterBar
          tableId={tableId}
          clearSelection={clearSelection}
          openRemoveDialog={openRemoveDialog}
          openNewsletterSheet={openNewsletterSheet}
        />
      }
    />
  );
};

export default OrganizationsTable;
