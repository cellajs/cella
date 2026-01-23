import type { RowsChangeData } from '@cella/data-grid';
import { useInfiniteQuery } from '@tanstack/react-query';
import { appConfig } from 'config';
import { PaperclipIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from '~/api.gen';
import useSearchParams from '~/hooks/use-search-params';
import { attachmentsQueryOptions, useAttachmentUpdateMutation } from '~/modules/attachments/query';
import { AttachmentsTableBar } from '~/modules/attachments/table/attachments-bar';
import { useColumns } from '~/modules/attachments/table/attachments-columns';
import type { AttachmentsRouteSearchParams } from '~/modules/attachments/types';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { ContextEntityData } from '~/modules/entities/types';

const LIMIT = appConfig.requestLimits.attachments;

/** Stable row key getter function - defined outside component to prevent re-renders */
function rowKeyGetter(row: Attachment) {
  return row.id;
}

export interface AttachmentsTableProps {
  entity: ContextEntityData;
  isSheet?: boolean;
  canUpload?: boolean;
}

function AttachmentsTable({ entity, canUpload = true, isSheet = false }: AttachmentsTableProps) {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<AttachmentsRouteSearchParams>({ saveDataInSearch: !isSheet });

  const updateAttachment = useAttachmentUpdateMutation(entity.slug);

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

  const queryOptions = attachmentsQueryOptions({ orgIdOrSlug: entity.slug, q, sort, order, limit });

  const {
    data: rows,
    isLoading,
    isFetching,
    error,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    ...queryOptions,
    select: ({ pages }) => pages.flatMap(({ items }) => items),
  });

  // Update rows with mutation
  const onRowsChange = useCallback(
    (changedRows: Attachment[], { indexes, column }: RowsChangeData<Attachment>) => {
      if (column.key !== 'name') return;

      // If name is changed, update the attachment
      for (const index of indexes) {
        const attachment = changedRows[index];
        updateAttachment.mutate({ id: attachment.id, data: { name: attachment.name } });
      }
    },
    [updateAttachment, t],
  );

  const fetchMore = useCallback(async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await fetchNextPage();
  }, [hasNextPage, isLoading, isFetching, fetchNextPage]);

  const onSelectedRowsChange = useCallback(
    (value: Set<string>) => {
      if (rows) setSelected(rows.filter((row) => value.has(row.id)));
    },
    [rows],
  );

  // Memoize the Set of selected row IDs to prevent unnecessary re-renders
  const selectedRowIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  // Memoize visible columns to prevent recalculation on every render
  const visibleColumns = useMemo(() => columns.filter((column) => column.visible), [columns]);

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
        total={rows?.length ?? 0}
      />
      <DataTable<Attachment>
        {...{
          rows,
          rowHeight: 52,
          onRowsChange,
          rowKeyGetter,
          columns: visibleColumns,
          enableVirtualization: true,
          limit,
          error,
          isLoading,
          isFetching,
          isFiltered: !!q,
          hasNextPage,
          fetchMore,
          selectedRows: selectedRowIds,
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent,
        }}
      />
    </div>
  );
}

export default AttachmentsTable;
