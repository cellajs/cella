import { useInfiniteQuery } from '@tanstack/react-query';
import { PaperclipIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import type { Attachment } from '~/api.gen';
import { useSearchParams } from '~/hooks/use-search-params';
import { attachmentsListQueryOptions, useAttachmentUpdateMutation } from '~/modules/attachment/query';
import { AttachmentsTableBar } from '~/modules/attachment/table/attachments-bar';
import { useColumns } from '~/modules/attachment/table/attachments-columns';
import type { AttachmentsRouteSearchParams } from '~/modules/attachment/types';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import type { RowsChangeData } from '~/modules/common/data-grid';
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

  const queryOptions = attachmentsListQueryOptions({ orgId: entity.id, q, sort, order, limit });

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
  const onRowsChange = (changedRows: Attachment[], { indexes, column }: RowsChangeData<Attachment>) => {
    if (column.key !== 'name') return;

    // If name is changed, update the attachment
    for (const index of indexes) {
      const attachment = changedRows[index];
      updateAttachment.mutate({ id: attachment.id, data: { name: attachment.name } });
    }
  };

  const fetchMore = async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await fetchNextPage();
  };

  const onSelectedRowsChange = (value: Set<string>) => {
    if (rows) setSelected(rows.filter((row) => value.has(row.id)));
  };

  const selectedRowIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

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
