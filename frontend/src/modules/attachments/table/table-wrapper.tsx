import { appConfig } from 'config';
import { Info } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import useSearchParams from '~/hooks/use-search-params';
import { useColumns } from '~/modules/attachments/table/columns';
import BaseDataTable from '~/modules/attachments/table/table';
import { AttachmentsTableBar } from '~/modules/attachments/table/table-bar';
import type { Attachment } from '~/modules/attachments/types';
import { useElectricSyncAttachments } from '~/modules/attachments/use-electric-sync-attachments';
import { useLocalSyncAttachments } from '~/modules/attachments/use-local-sync-attachments';
import { useMergeLocalAttachments } from '~/modules/attachments/use-merge-local-attachments';
import { AlertWrap } from '~/modules/common/alert-wrap';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { BaseTableMethods } from '~/modules/common/data-table/types';
import type { EntityPage } from '~/modules/entities/types';
import type { attachmentsSearchSchema } from '~/routes/organizations';

const LIMIT = appConfig.requestLimits.attachments;

export type AttachmentSearch = z.infer<typeof attachmentsSearchSchema>;
export interface AttachmentsTableProps {
  entity: EntityPage;
  isSheet?: boolean;
  canUpload?: boolean;
}

const AttachmentsTable = ({ entity, canUpload = true, isSheet = false }: AttachmentsTableProps) => {
  const { t } = useTranslation();

  const { search, setSearch } = useSearchParams<AttachmentSearch>({ saveDataInSearch: !isSheet });
  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // Table state
  const { sort, order } = search;
  const limit = LIMIT;

  useElectricSyncAttachments(entity.id);
  useLocalSyncAttachments(entity.id);
  useMergeLocalAttachments(entity.id, search);

  const [total, setTotal] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<Attachment[]>([]);
  const [isCompact, setIsCompact] = useState(false);

  // Build columns
  const [columns, setColumns] = useState(useColumns(entity, isSheet, isCompact));
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <AttachmentsTableBar
        entity={entity}
        total={total}
        selected={selected}
        searchVars={{ ...search, limit }}
        setSearch={setSearch}
        columns={columns}
        setColumns={setColumns}
        clearSelection={clearSelection}
        isSheet={isSheet}
        canUpload={canUpload}
        isCompact={isCompact}
        setIsCompact={setIsCompact}
      />
      <div className={(isCompact && 'isCompact') || ''}>
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
              <AlertWrap id="edit_attachment" variant="plain" icon={Info}>
                {t('common:edit_attachment.text')}
              </AlertWrap>
            </motion.div>
          )}
        </AnimatePresence>
        <BaseDataTable
          entity={entity}
          ref={dataTableRef}
          columns={columns}
          searchVars={{ ...search, limit }}
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
