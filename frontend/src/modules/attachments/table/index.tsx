import { config } from 'config';
import { Suspense, lazy, useRef, useState } from 'react';
import type { z } from 'zod';

import { Info } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import useSearchParams from '~/hooks/use-search-params';
import RemoveAttachmentsForm from '~/modules/attachments/table/remove-attachments-form';
import { AttachmentsTableHeader } from '~/modules/attachments/table/table-header';
import type { Attachment } from '~/modules/attachments/types';
import { AlertWrap } from '~/modules/common/alert-wrap';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { BaseTableMethods, ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { dialog } from '~/modules/common/dialoger/state';
import type { Organization } from '~/modules/organizations/types';
import type { attachmentsSearchSchema } from '~/routes/organizations';
import { arraysHaveSameElements } from '~/utils';

const BaseDataTable = lazy(() => import('~/modules/attachments/table/table'));
const LIMIT = config.requestLimits.attachments;

export type AttachmentSearch = z.infer<typeof attachmentsSearchSchema>;
export interface AttachmentsTableProps {
  organization: Organization;
  isSheet?: boolean;
  canUpload?: boolean;
}

const AttachmentsTable = ({ organization, canUpload = true, isSheet = false }: AttachmentsTableProps) => {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<AttachmentSearch>({ saveDataInSearch: !isSheet });

  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // Table state
  const { q, sort, order } = search;
  const limit = LIMIT;

  // State for selected and total counts
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<Attachment[]>([]);

  // Update total and selected counts
  const updateCounts = (newSelected: Attachment[], newTotal: number) => {
    if (newTotal !== total) setTotal(newTotal);
    if (!arraysHaveSameElements(selected, newSelected)) setSelected(newSelected);
  };

  // Build columns
  const [columns, setColumns] = useState<ColumnOrColumnGroup<Attachment>[]>([]);
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  const openRemoveDialog = () => {
    dialog(<RemoveAttachmentsForm organizationId={organization.id} dialog attachments={selected} />, {
      className: 'max-w-xl',
      title: t('common:remove_resource', { resource: t('common:attachment').toLowerCase() }),
      description: t('common:confirm.delete_resources', { resources: t('common:attachments').toLowerCase() }),
    });
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <AttachmentsTableHeader
        organization={organization}
        total={total}
        selected={selected}
        q={q ?? ''}
        setSearch={setSearch}
        columns={columns}
        setColumns={setColumns}
        clearSelection={clearSelection}
        openRemoveDialog={openRemoveDialog}
        isSheet={isSheet}
        canUpload={canUpload}
      />
      <div>
        {/* Explainer alert box */}
        <AnimatePresence initial={false}>
          {!!total && (
            <motion.div
              key="alert"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                height: { duration: 0.3 },
                opacity: { delay: 0.6, duration: 0.2 },
              }}
              style={{ overflow: 'hidden' }}
            >
              <AlertWrap id="edit_attachment" variant="plain" Icon={Info}>
                {t('common:edit_attachment.text')}
              </AlertWrap>
            </motion.div>
          )}
        </AnimatePresence>
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
    </div>
  );
};

export default AttachmentsTable;
