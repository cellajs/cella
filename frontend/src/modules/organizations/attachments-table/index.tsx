import { config } from 'config';
import { Suspense, lazy, useMemo, useRef, useState } from 'react';
import type { z } from 'zod';
import type { attachmentsQuerySchema } from '#/modules/attachments/schema';

import { useSearch } from '@tanstack/react-router';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { showToast } from '~/lib/toasts';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import { getInitialSortColumns } from '~/modules/common/data-table/sort-columns';
import { dialog } from '~/modules/common/dialoger/state';
import { AttachmentsTableHeader } from '~/modules/organizations/attachments-table/table-header';
import type { Attachment, BaseTableMethods, Organization } from '~/types/common';
import { arraysHaveSameElements } from '~/utils';
import RemoveAttachmentsForm from './remove-attachments-form';

const BaseAttachmentsTable = lazy(() => import('~/modules/organizations/attachments-table/table'));
const LIMIT = config.requestLimits.attachments;

export type AttachmentSearch = z.infer<typeof attachmentsQuerySchema>;
export interface AttachmentsTableProps {
  organization: Organization;
  isSheet?: boolean;
  canUploadAttachments?: boolean;
}

const AttachmentsTable = ({ organization, canUploadAttachments = true, isSheet = false }: AttachmentsTableProps) => {
  const { t } = useTranslation();
  const search = useSearch({ strict: false });
  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // Table state
  const [q, setQuery] = useState<AttachmentSearch['q']>(search.q);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // State for selected and total counts
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Attachment[]>([]);

  // Update total and selected counts
  const updateCounts = (newSelected: Attachment[], newTotal: number) => {
    if (newTotal !== total) setTotal(newTotal);
    if (!arraysHaveSameElements(selected, newSelected)) setSelected(newSelected);
  };

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

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  const openRemoveDialog = () => {
    dialog(
      <RemoveAttachmentsForm
        organizationId={organization.id}
        dialog
        callback={() => {
          showToast(t('common:success.delete_resources', { resources: t('common:attachments') }), 'success');
        }}
        attachments={selected}
      />,
      {
        className: 'max-w-xl',
        title: t('common:remove_resource', { resource: t('attachment').toLowerCase() }),
        description: t('common:confirm.delete_resources', { resources: t('common:attachments').toLowerCase() }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <AttachmentsTableHeader
        organization={organization}
        total={total}
        selected={selected}
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
          updateCounts={updateCounts}
          isSheet={isSheet}
          canUploadAttachments={canUploadAttachments}
        />
      </Suspense>
    </div>
  );
};

export default AttachmentsTable;
