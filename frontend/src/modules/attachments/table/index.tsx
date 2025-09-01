import { useInfiniteQuery } from '@tanstack/react-query';
import { appConfig } from 'config';
import { Paperclip } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { RowsChangeData } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import useOfflineTableSearch from '~/hooks/use-offline-table-search';
import useSearchParams from '~/hooks/use-search-params';
import { attachmentsQueryOptions } from '~/modules/attachments/query';
import { useAttachmentUpdateMutation } from '~/modules/attachments/query-mutations';
import { AttachmentsTableBar } from '~/modules/attachments/table/bar';
import { useColumns } from '~/modules/attachments/table/columns';
import type { Attachment } from '~/modules/attachments/types';
import { useElectricSyncAttachments } from '~/modules/attachments/use-electric-sync-attachments';
import { useLocalSyncAttachments } from '~/modules/attachments/use-local-sync-attachments';
import { useMergeLocalAttachments } from '~/modules/attachments/use-merge-local-attachments';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
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
  const attachmentUpdateMutation = useAttachmentUpdateMutation();
  const { search, setSearch } = useSearchParams<AttachmentSearch>({ saveDataInSearch: !isSheet });

  useElectricSyncAttachments(entity.id);
  useLocalSyncAttachments(entity.id);
  useMergeLocalAttachments(entity.id, search);

  // Table state
  const { q, sort, order } = search;
  const limit = LIMIT;

  const [isCompact, setIsCompact] = useState(false);

  // Build columns
  const [selected, setSelected] = useState<Attachment[]>([]);
  const [columns, setColumns] = useState(useColumns(entity, isSheet, isCompact));
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  const queryOptions = attachmentsQueryOptions({ orgIdOrSlug: entity.membership?.organizationId || entity.id, ...search, limit });
  const {
    data: fetchedRows,
    isLoading,
    isFetching,
    error,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    ...queryOptions,
    select: ({ pages }) => pages.flatMap(({ items }) => items),
  });
  const rows = useOfflineTableSearch({
    data: fetchedRows,
    filterFn: ({ q }, item) => {
      if (!q) return true;
      const query = q.trim().toLowerCase(); // Normalize query
      return item.name.toLowerCase().includes(query) || item.filename.toLowerCase().includes(query);
    },
  });

  // Update rows
  const onRowsChange = (changedRows: Attachment[], { indexes, column }: RowsChangeData<Attachment>) => {
    if (column.key !== 'name') return;

    // If name is changed, update the attachment
    for (const index of indexes) {
      const attachment = changedRows[index];
      attachmentUpdateMutation.mutate({
        id: attachment.id,
        orgIdOrSlug: entity.id,
        name: attachment.name,
      });
    }
  };

  // isFetching already includes next page fetch scenario
  const fetchMore = useCallback(async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await fetchNextPage();
  }, [hasNextPage, isLoading, isFetching]);

  const onSelectedRowsChange = (value: Set<string>) => {
    if (rows) setSelected(rows.filter((row) => value.has(row.id)));
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <AttachmentsTableBar
        entity={entity}
        queryKey={queryOptions.queryKey}
        selected={selected}
        searchVars={{ ...search, limit }}
        setSearch={setSearch}
        columns={columns}
        setColumns={setColumns}
        clearSelection={() => setSelected([])}
        isSheet={isSheet}
        canUpload={canUpload}
        isCompact={isCompact}
        setIsCompact={setIsCompact}
      />
      <div className={(isCompact && 'isCompact') || ''}>
        <DataTable<Attachment>
          {...{
            rows,
            rowHeight: 52,
            onRowsChange,
            rowKeyGetter: (row) => row.id,
            columns: columns.filter((column) => column.visible),
            enableVirtualization: false,
            limit,
            error,
            isLoading,
            isFetching,
            isFiltered: !!q,
            hasNextPage,
            fetchMore,
            selectedRows: new Set(selected.map((s) => s.id)),
            onSelectedRowsChange,
            sortColumns,
            onSortColumnsChange,
            NoRowsComponent: (
              <ContentPlaceholder icon={Paperclip} title={t('common:no_resource_yet', { resource: t('common:attachments').toLowerCase() })} />
            ),
          }}
        />
      </div>
    </div>
  );
};

export default AttachmentsTable;
