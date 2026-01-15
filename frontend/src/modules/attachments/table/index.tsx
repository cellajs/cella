import { ilike, isNull, not, or, useLiveInfiniteQuery, useLiveQuery } from '@tanstack/react-db';
import { useLoaderData } from '@tanstack/react-router';
import { appConfig } from 'config';
import { PaperclipIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { RowsChangeData } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import type { Attachment } from '~/api.gen';
import useOfflineTableSearch from '~/hooks/use-offline-table-search';
import useSearchParams from '~/hooks/use-search-params';
import { useOfflineAttachments } from '~/modules/attachments/offline';
import { AttachmentsTableBar } from '~/modules/attachments/table/attachments-bar';
import { useColumns } from '~/modules/attachments/table/attachments-columns';
import type { AttachmentsRouteSearchParams } from '~/modules/attachments/types';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { ContextEntityData } from '~/modules/entities/types';
import { OrganizationAttachmentsRoute } from '~/routes/organization-routes';
import { attachmentStorage } from '../dexie/storage-service';

const LIMIT = appConfig.requestLimits.attachments;

export interface AttachmentsTableProps {
  entity: ContextEntityData;
  isSheet?: boolean;
  canUpload?: boolean;
}

const AttachmentsTable = ({ entity, canUpload = true, isSheet = false }: AttachmentsTableProps) => {
  const { t } = useTranslation();
  const { attachmentsCollection, localAttachmentsCollection } = useLoaderData({
    from: OrganizationAttachmentsRoute.id,
  });
  const { search, setSearch } = useSearchParams<AttachmentsRouteSearchParams>({ saveDataInSearch: !isSheet });

  // Initialize offline transactions for attachments
  // TODO: Use getState() to show pending sync indicator in UI when needed
  const { updateOffline } = useOfflineAttachments({
    attachmentsCollection,
    organizationId: entity.id,
  });

  // Table state
  const { q, sort, order } = search;
  const limit = LIMIT;

  const [isCompact, setIsCompact] = useState(false);

  // Build columns
  const [selected, setSelected] = useState<Attachment[]>([]);
  const columnsFromHook = useColumns(entity, isSheet, isCompact);
  const [columns, setColumns] = useState(columnsFromHook);
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  // Sync columns when isCompact changes (preserve visibility settings)
  useEffect(() => {
    setColumns((prev) =>
      columnsFromHook.map((col) => ({
        ...col,
        visible: prev.find((p) => p.key === col.key)?.visible ?? col.visible,
      })),
    );
  }, [isCompact]);

  const {
    data: fetchedRows,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useLiveInfiniteQuery(
    (liveQuery) => {
      return liveQuery
        .from({ attachment: attachmentsCollection })
        .where(({ attachment }) =>
          q
            ? or(ilike(attachment.name, `%${q.trim()}%`), ilike(attachment.filename, `%${q.trim()}%`))
            : not(isNull(attachment.id)),
        )
        .orderBy(({ attachment }) => attachment[sort || 'createdAt'], order || 'desc');
    },
    {
      pageSize: limit,
      getNextPageParam: (lastPage, allPages) => {
        const total = lastPage.length;
        const fetchedCount = allPages.reduce((acc, page) => acc + page.length, 0);

        if (fetchedCount >= total) return undefined;
        return fetchedCount;
      },
    },
    [entity.id, q, sort, order],
  );

  useEffect(() => {
    attachmentStorage.addCachedImage(fetchedRows);
  }, [fetchedRows]);

  //
  const { data: localRows } = useLiveQuery(
    (liveQuery) => {
      return liveQuery
        .from({ attachment: localAttachmentsCollection })
        .where(({ attachment }) =>
          q
            ? or(ilike(attachment.name, `%${q.trim()}%`), ilike(attachment.filename, `%${q.trim()}%`))
            : not(isNull(attachment.id)),
        )
        .orderBy(({ attachment }) => attachment[sort || 'createdAt'], order || 'desc');
    },
    [entity.id, q, sort, order],
  );

  const combinedData = [...fetchedRows, ...localRows];

  // TODO(tanstackDB) add ordering
  const rows = useOfflineTableSearch({
    data: combinedData,
    filterFn: ({ q }, item) => {
      if (!q) return true;
      const query = q.trim().toLowerCase(); // Normalize query
      return item.name.toLowerCase().includes(query) || item.filename.toLowerCase().includes(query);
    },
  });

  // Update rows with offline support
  const onRowsChange = useCallback(
    (changedRows: Attachment[], { indexes, column }: RowsChangeData<Attachment>) => {
      if (column.key !== 'name') return;

      // If name is changed, update the attachment with offline transaction support
      for (const index of indexes) {
        const attachment = changedRows[index];
        const isLocalAttachment = attachment.originalKey?.startsWith('blob:http');

        if (isLocalAttachment) {
          // Local attachments update directly (not synced to server yet)
          localAttachmentsCollection.update(attachment.id, (draft: Attachment) => {
            draft.name = attachment.name;
          });
        } else {
          // Server attachments use offline transactions for guaranteed sync
          updateOffline(attachment.id, { name: attachment.name });
        }
      }
    },
    [localAttachmentsCollection, updateOffline],
  );

  const fetchMore = useCallback(async () => {
    if (!hasNextPage || isLoading || isFetchingNextPage) return;
    fetchNextPage();
  }, [hasNextPage, isLoading, isFetchingNextPage, fetchNextPage]);

  const onSelectedRowsChange = useCallback(
    (value: Set<string>) => {
      if (rows) setSelected(rows.filter((row) => value.has(row.id)));
    },
    [rows],
  );

  const rowKeyGetter = (row: Attachment) => row.id;

  const selectedRows = new Set(selected.map((s) => s.id));

  const visibleColumns = columns.filter((column) => column.visible);

  const error = isError ? new Error(t('common:failed_to_load_attachments')) : undefined;

  const NoRowsComponent = (
    <ContentPlaceholder
      icon={PaperclipIcon}
      title="common:no_resource_yet"
      titleProps={{ resource: t('common:attachments').toLowerCase() }}
    />
  );

  const clearSelection = () => setSelected([]);

  return (
    <div className="flex flex-col gap-4 h-full" data-is-compact={isCompact}>
      <AttachmentsTableBar
        entity={entity}
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
        total={fetchedRows.length + localRows.length}
      />
      <DataTable<Attachment>
        {...{
          rows,
          rowHeight: 52,
          onRowsChange,
          rowKeyGetter,
          columns: visibleColumns,
          enableVirtualization: false,
          limit,
          error,
          isLoading,
          isFiltered: !!q,
          hasNextPage,
          fetchMore,
          selectedRows,
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent,
        }}
      />
    </div>
  );
};

export default AttachmentsTable;
