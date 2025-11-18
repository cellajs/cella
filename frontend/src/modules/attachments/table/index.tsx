import { ilike, isNull, not, or, useLiveInfiniteQuery, useLiveQuery } from '@tanstack/react-db';
import { useLoaderData } from '@tanstack/react-router';
import { appConfig } from 'config';
import { PaperclipIcon } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { RowsChangeData } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import type { Attachment } from '~/api.gen';
import useOfflineTableSearch from '~/hooks/use-offline-table-search';
import useSearchParams from '~/hooks/use-search-params';
import { useLocalSyncAttachments } from '~/modules/attachments/hooks/use-local-sync-attachments';
import { AttachmentsTableBar } from '~/modules/attachments/table/bar';
import { useColumns } from '~/modules/attachments/table/columns';
import type { AttachmentsRouteSearchParams } from '~/modules/attachments/types';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { EntityPage } from '~/modules/entities/types';
import { OrganizationAttachmentsRoute } from '~/routes/organization-routes';
import { isCDNUrl } from '~/utils/is-cdn-url';

const LIMIT = appConfig.requestLimits.attachments;

export interface AttachmentsTableProps {
  entity: EntityPage;
  isSheet?: boolean;
  canUpload?: boolean;
}

const AttachmentsTable = ({ entity, canUpload = true, isSheet = false }: AttachmentsTableProps) => {
  const { t } = useTranslation();
  const { attachmentsCollection, localAttachmentsCollection } = useLoaderData({ from: OrganizationAttachmentsRoute.id });
  const { search, setSearch } = useSearchParams<AttachmentsRouteSearchParams>({ saveDataInSearch: !isSheet });

  useLocalSyncAttachments(entity.id);

  // Table state
  const { q, sort, order } = search;
  const limit = LIMIT;

  const [isCompact, setIsCompact] = useState(false);

  // Build columns
  const [selected, setSelected] = useState<Attachment[]>([]);
  const [columns, setColumns] = useState(useColumns(entity, isSheet, isCompact));
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

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
          q ? or(ilike(attachment.name, `%${q.trim()}%`), ilike(attachment.filename, `%${q.trim()}%`)) : not(isNull(attachment.id)),
        )
        .orderBy(({ attachment }) => attachment[sort || 'id'], order);
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
    [(entity.id, sort, order, q, limit)],
  );

  const { data: localRows } = useLiveQuery(
    (liveQuery) => {
      return liveQuery
        .from({ attachment: localAttachmentsCollection })
        .where(({ attachment }) =>
          q ? or(ilike(attachment.name, `%${q.trim()}%`), ilike(attachment.filename, `%${q.trim()}%`)) : not(isNull(attachment.id)),
        )
        .orderBy(({ attachment }) => attachment[sort || 'id'], order);
    },
    [(entity.id, sort, order, q, limit)],
  );

  // TODO(tanstakDB) add ordering
  const rows = useOfflineTableSearch({
    data: [...fetchedRows, ...localRows],
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
      const collection = isCDNUrl(attachment.url) ? attachmentsCollection : localAttachmentsCollection;

      collection.update(attachment.id, (draft) => {
        draft.name = attachment.name;
      });
    }
  };

  // isFetching already includes next page fetch scenario
  const fetchMore = useCallback(async () => {
    if (!hasNextPage || isLoading || isFetchingNextPage) return;
    fetchNextPage();
  }, [hasNextPage, isLoading, isFetchingNextPage]);

  const onSelectedRowsChange = (value: Set<string>) => {
    if (rows) setSelected(rows.filter((row) => value.has(row.id)));
  };

  return (
    <div className="flex flex-col gap-4 h-full" data-is-compact={isCompact}>
      <AttachmentsTableBar
        entity={entity}
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
      <DataTable<Attachment>
        {...{
          rows,
          rowHeight: 52,
          onRowsChange,
          rowKeyGetter: (row) => row.id,
          columns: columns.filter((column) => column.visible),
          enableVirtualization: false,
          limit,
          error: isError ? new Error(t('common:failed_to_load_attachments')) : undefined,
          isLoading,
          isFiltered: !!q,
          hasNextPage,
          fetchMore,
          selectedRows: new Set(selected.map((s) => s.id)),
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: (
            <ContentPlaceholder icon={PaperclipIcon} title={t('common:no_resource_yet', { resource: t('common:attachments').toLowerCase() })} />
          ),
        }}
      />
    </div>
  );
};

export default AttachmentsTable;
