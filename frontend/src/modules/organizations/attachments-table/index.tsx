import { config } from 'config';
import { Suspense, lazy, useMemo, useRef, useState } from 'react';
import type { z } from 'zod';
import type { attachmentsQuerySchema } from '#/modules/attachments/schema';

import { useSearch } from '@tanstack/react-router';
import type { SortColumn } from 'react-data-grid';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import { getInitialSortColumns } from '~/modules/common/data-table/sort-columns';
import { AttachmentsTableHeader } from '~/modules/organizations/attachments-table/table-header';
import type { Attachment, BaseTableMethods, Organization } from '~/types/common';

const BaseAttachmentsTable = lazy(() => import('~/modules/organizations/attachments-table/table'));
const LIMIT = config.requestLimits.attachments;

export type AttachmentSearch = z.infer<typeof attachmentsQuerySchema>;
export interface AttachmentsTableProps {
  organization: Organization;
  isSheet?: boolean;
  canUploadAttachments?: boolean;
}

const AttachmentsTable = ({ organization, canUploadAttachments = true, isSheet = false }: AttachmentsTableProps) => {
  const search = useSearch({ strict: false });
  // Table state
  const [q, setQuery] = useState<AttachmentSearch['q']>(search.q);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // Build columns
  const [columns, setColumns] = useState<ColumnOrColumnGroup<Attachment>[]>([]);

  // Search query options
  const sort = sortColumns[0]?.columnKey as AttachmentSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as AttachmentSearch['order'];
  const limit = LIMIT;

  // Save filters in search params
  if (!isSheet) {
    const filters = useMemo(() => ({ q, sort, order }), [q, sortColumns]);
    useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });
  }

  const tableId = `attachments-table-${organization.id}`;
  const dataTableRef = useRef<BaseTableMethods | null>(null);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  const openRemoveDialog = () => {
    if (dataTableRef.current) dataTableRef.current.openRemoveDialog();
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <AttachmentsTableHeader
        tableId={tableId}
        organization={organization}
        q={q ?? ''}
        setQuery={setQuery}
        columns={columns}
        setColumns={setColumns}
        clearSelection={clearSelection}
        openRemoveDialog={openRemoveDialog}
        isSheet={isSheet}
        canUploadAttachments={canUploadAttachments}
      />
      <Suspense>
        <BaseAttachmentsTable
          organization={organization}
          ref={dataTableRef}
          tableId={tableId}
          columns={columns}
          setColumns={setColumns}
          sortColumns={sortColumns}
          setSortColumns={setSortColumns}
          queryVars={{
            q,
            sort,
            order,
            limit,
          }}
          isSheet={isSheet}
          canUploadAttachments={canUploadAttachments}
        />
      </Suspense>
    </div>
  );
};

export default AttachmentsTable;
