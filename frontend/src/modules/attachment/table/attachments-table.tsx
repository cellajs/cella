import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { PaperclipIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from 'sdk';
import { appConfig } from 'shared';
import { useSearchParams } from '~/hooks/use-search-params';
import {
  attachmentsCanonicalOptions,
  attachmentsListQueryOptions,
  useAttachmentUpdateMutation,
} from '~/modules/attachment/query';
import { attachmentsSearchDefaults } from '~/modules/attachment/search-params-schemas';
import { AttachmentsTableBar } from '~/modules/attachment/table/attachments-bar';
import { useColumns } from '~/modules/attachment/table/attachments-columns';
import type { AttachmentsRouteSearchParams } from '~/modules/attachment/types';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import type { RowsChangeData } from '~/modules/common/data-grid';
import { DataTable } from '~/modules/common/data-table/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { EnrichedChannel } from '~/modules/entities/types';
import { isDefaultListView } from '~/query/basic/create-query-keys';

const LIMIT = appConfig.requestLimits.attachments;

/** Defined outside the component so the getter identity stays stable. */
function rowKeyGetter(row: Attachment) {
  return row.id;
}

/** Default-view rows from the canonical query, ordered like the server's default list. */
function selectDefaultViewRows({ items }: { items: Attachment[] }) {
  return [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export interface AttachmentsTableProps {
  channel: EnrichedChannel;
  isSheet?: boolean;
  /** Override for special contexts; defaults to the caller's create permission on the channel. */
  canUpload?: boolean;
}

function AttachmentsTable({ channel, canUpload, isSheet = false }: AttachmentsTableProps) {
  // Create has no row to resolve 'own' against, so only an unconditional grant shows upload, and
  // only on channels the app declares as upload targets (`attachmentUploadTargets`).
  const isUploadTarget = (appConfig.attachmentUploadTargets as readonly string[]).includes(channel.entityType);
  const allowUpload = canUpload ?? (isUploadTarget && channel.can?.attachment?.create === true);
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<AttachmentsRouteSearchParams>({ saveDataInSearch: !isSheet });

  const updateAttachment = useAttachmentUpdateMutation(channel.tenantId, channel.id);

  // Table state
  const { q, sort, order } = search;
  const limit = LIMIT;

  const [selected, setSelected] = useState<Attachment[]>([]);
  const columnsFromHook = useColumns(channel, isSheet);
  const [hiddenOverrides, setHiddenOverrides] = useState<Record<string, boolean>>({});
  const columns = useMemo(
    () =>
      columnsFromHook.map((col) => ({
        ...col,
        hidden: hiddenOverrides[col.key] ?? col.hidden,
      })),
    [columnsFromHook, hiddenOverrides],
  );
  const setColumns: React.Dispatch<React.SetStateAction<ColumnOrColumnGroup<Attachment>[]>> = (updater) => {
    const newCols = typeof updater === 'function' ? updater(columns) : updater;
    setHiddenOverrides((prev) => {
      const next = { ...prev };
      for (const col of newCols) {
        if (col.hidden !== undefined) next[col.key] = col.hidden;
      }
      return next;
    });
  };
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  // Default view (no search, default sort) reads the canonical org query that SyncService prefetches; any other filter uses the infinite query.
  const isDefaultView = isDefaultListView({ q, sort, order }, attachmentsSearchDefaults);

  const canonicalOptions = attachmentsCanonicalOptions({
    tenantId: channel.tenantId,
    organizationId: channel.id,
  });
  const canonical = useQuery({
    ...canonicalOptions,
    enabled: isDefaultView,
    select: selectDefaultViewRows,
  });

  const queryOptions = attachmentsListQueryOptions({
    tenantId: channel.tenantId,
    organizationId: channel.id,
    q,
    sort,
    order,
    limit,
  });
  const filtered = useInfiniteQuery({
    ...queryOptions,
    enabled: !isDefaultView,
    refetchOnMount: true,
    select: ({ pages }) => pages.flatMap(({ items }) => items),
  });

  const { data: rows, isLoading, isFetching, error } = isDefaultView ? canonical : filtered;
  const hasNextPage = isDefaultView ? false : filtered.hasNextPage;

  const onRowsChange = (changedRows: Attachment[], { indexes, column }: RowsChangeData<Attachment>) => {
    if (column.key !== 'name') return;

    for (const index of indexes) {
      const attachment = changedRows[index];
      updateAttachment.mutate({ id: attachment.id, ops: { name: attachment.name } });
    }
  };

  const fetchMore = async () => {
    if (!hasNextPage || isLoading || isFetching) return;
    await filtered.fetchNextPage();
  };

  const onSelectedRowsChange = (value: Set<string>) => {
    if (rows) setSelected(rows.filter((row) => value.has(row.id)));
  };

  const selectedRowIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  const NoRowsComponent = (
    <ContentPlaceholder
      icon={PaperclipIcon}
      title="c:no_resource_yet"
      titleProps={{ resource: t('c:attachment_other').toLowerCase() }}
    />
  );

  const clearSelection = () => setSelected([]);

  return (
    <>
      <AttachmentsTableBar
        channel={channel}
        selected={selected}
        searchVars={{ ...search, limit }}
        setSearch={setSearch}
        columns={columns}
        setColumns={setColumns}
        clearSelection={clearSelection}
        isSheet={isSheet}
        canUpload={allowUpload}
        queryKey={isDefaultView ? canonicalOptions.queryKey : queryOptions.queryKey}
      />
      <DataTable<Attachment>
        {...{
          rows,
          rowHeight: 52,
          onRowsChange,
          rowKeyGetter,
          columns,
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
    </>
  );
}

export { AttachmentsTable };
