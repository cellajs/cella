import { useRef } from 'react';
import type { z } from 'zod';
import { AttachmentsTableFilterBar } from '~/modules/organizations/attachments-table/filter-bar';
import { BaseAttachmentsTable } from '~/modules/organizations/attachments-table/table';
import type { BaseTableMethods, Organization } from '~/types/common';
import type { attachmentsQuerySchema } from '#/modules/attachments/schema';

export type AttachmentSearch = z.infer<typeof attachmentsQuerySchema>;

export interface AttachmentsTableProps {
  organization: Organization;
  isSheet?: boolean;
  canUploadAttachments?: boolean;
}

const AttachmentsTable = ({ organization, canUploadAttachments = true, isSheet = false }: AttachmentsTableProps) => {
  const tableId = `attachments-table-${organization.id}`;
  const dataTableRef = useRef<BaseTableMethods | null>(null);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  const openRemoveDialog = () => {
    if (dataTableRef.current) dataTableRef.current.openRemoveDialog();
  };

  return (
    <BaseAttachmentsTable
      organization={organization}
      ref={dataTableRef}
      tableId={tableId}
      isSheet={isSheet}
      tableFilterBar={
        <AttachmentsTableFilterBar
          organization={organization}
          tableId={tableId}
          canUploadAttachments={canUploadAttachments}
          clearSelection={clearSelection}
          openRemoveDialog={openRemoveDialog}
        />
      }
    />
  );
};

export default AttachmentsTable;
