import { config } from 'config';
import { useRef, useState } from 'react';
import type { z } from 'zod';

import { Info } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import useSearchParams from '~/hooks/use-search-params';
import { useColumns } from '~/modules/attachments/table/columns';
import { useSync } from '~/modules/attachments/table/hooks/use-sync';
import RemoveAttachmentsForm from '~/modules/attachments/table/remove-attachments-form';
import BaseDataTable from '~/modules/attachments/table/table';
import { AttachmentsTableBar } from '~/modules/attachments/table/table-bar';
import type { Attachment } from '~/modules/attachments/types';
import { AlertWrap } from '~/modules/common/alert-wrap';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { BaseTableMethods } from '~/modules/common/data-table/types';
import { dialog } from '~/modules/common/dialoger/state';
import type { EntityPage } from '~/modules/entities/types';
import type { attachmentsSearchSchema } from '~/routes/organizations';
import { useUserStore } from '~/store/user';

const LIMIT = config.requestLimits.attachments;

export type AttachmentSearch = z.infer<typeof attachmentsSearchSchema>;
export interface AttachmentsTableProps {
  entity: EntityPage;
  isSheet?: boolean;
  canUpload?: boolean;
}

const AttachmentsTable = ({ entity, canUpload = true, isSheet = false }: AttachmentsTableProps) => {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);

  const { search, setSearch } = useSearchParams<AttachmentSearch>({ saveDataInSearch: !isSheet });
  const dataTableRef = useRef<BaseTableMethods | null>(null);

  const isAdmin = entity.membership?.role === 'admin' || user?.role === 'admin';

  // Table state
  const { q, sort, order } = search;
  const limit = LIMIT;

  useSync(entity.id);

  const [total, setTotal] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<Attachment[]>([]);
  const [highDensity, setHighDensity] = useState(false);

  // Build columns
  const [columns, setColumns] = useState(useColumns(isAdmin, isSheet, highDensity));
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  const openRemoveDialog = () => {
    dialog(<RemoveAttachmentsForm entity={entity} dialog attachments={selected} callback={clearSelection} />, {
      className: 'max-w-xl',
      title: t('common:remove_resource', { resource: t('common:attachment').toLowerCase() }),
      description: t('common:confirm.delete_resources', { resources: t('common:attachments').toLowerCase() }),
    });
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <AttachmentsTableBar
        entity={entity}
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
        highDensity={highDensity}
        toggleDensityView={setHighDensity}
      />
      <div className={(highDensity && 'high-density') || ''}>
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
        <BaseDataTable
          entity={entity}
          ref={dataTableRef}
          columns={columns}
          queryVars={{ q, sort, order, limit }}
          isSheet={isSheet}
          canUpload={canUpload}
          sortColumns={sortColumns}
          setSortColumns={setSortColumns}
          setTotal={setTotal}
          setSelected={setSelected}
        />
      </div>
    </div>
  );
};

export default AttachmentsTable;
