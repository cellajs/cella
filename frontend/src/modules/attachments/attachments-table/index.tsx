import { config } from 'config';
import { Suspense, lazy, useRef, useState } from 'react';
import type { z } from 'zod';
import type { attachmentsQuerySchema } from '#/modules/attachments/schema';

import { useTranslation } from 'react-i18next';
import useSearchParams from '~/hooks/use-search-params';
import { showToast } from '~/lib/toasts';
import { AttachmentsTableHeader } from '~/modules/attachments/attachments-table/table-header';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { dialog } from '~/modules/common/dialoger/state';
import { OrganizationAttachmentsRoute } from '~/routes/organizations';
import type { Attachment, BaseTableMethods, Organization } from '~/types/common';
import { arraysHaveSameElements } from '~/utils';
import RemoveAttachmentsForm from './remove-attachments-form';

const BaseDataTable = lazy(() => import('~/modules/attachments/attachments-table/table'));
const LIMIT = config.requestLimits.attachments;

export type AttachmentSearch = z.infer<typeof attachmentsQuerySchema>;
export interface AttachmentsTableProps {
  organization: Organization;
  isSheet?: boolean;
  canUpload?: boolean;
}

const AttachmentsTable = ({ organization, canUpload = true, isSheet = false }: AttachmentsTableProps) => {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams(OrganizationAttachmentsRoute.id);

  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // Table state
  const q = search.q;
  const sort = search.sort as AttachmentSearch['sort'];
  const order = search.order as AttachmentSearch['order'];
  const limit = LIMIT;

  // State for selected and total counts
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<Attachment[]>([]);

  // Update total and selected counts
  const updateCounts = (newSelected: Attachment[], newTotal: number) => {
    if (newTotal !== total) setTotal(newTotal);
    if (!arraysHaveSameElements(selected, newSelected)) setSelected(newSelected);
  };

  const setQuery = (q: string) => {
    setSearch({ q });
  };

  // Build columns
  const [columns, setColumns] = useState<ColumnOrColumnGroup<Attachment>[]>([]);
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

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
        title: t('common:remove_resource', { resource: t('common:attachment').toLowerCase() }),
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
        canUpload={canUpload}
      />
      <Suspense>
        <BaseDataTable
          organization={organization}
          ref={dataTableRef}
          columns={columns}
          setColumns={setColumns}
          queryVars={{ q, sort, order, limit }}
          updateCounts={updateCounts}
          isSheet={isSheet}
          canUpload={canUpload}
          sortColumns={sortColumns}
          setSortColumns={setSortColumns}
        />
      </Suspense>
    </div>
  );
};

export default AttachmentsTable;
