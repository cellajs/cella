import { useQuery } from '@tanstack/react-query';
import { PaperclipIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from 'sdk';
import { useSearchParams } from '~/hooks/use-search-params';
import { canUploadAttachments } from '~/modules/attachment/helpers/can-upload-attachments';
import { attachmentsCanonicalOptions, attachmentsListQueryOptions, useAttachmentUpdateMutation } from '~/modules/attachment/query';
import { attachmentsSearchDefaults } from '~/modules/attachment/search-params-schemas';
import { AttachmentsTableBar } from '~/modules/attachment/table/attachments-bar';
import { useColumns } from '~/modules/attachment/table/attachments-columns';
import type { AttachmentsRouteSearchParams } from '~/modules/attachment/types';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import type { RowsChangeData } from '~/modules/common/data-grid';
import { DataTable } from '~/modules/common/data-table/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { useColumnVisibility } from '~/modules/common/data-table/use-column-visibility';
import { useInfiniteRows } from '~/modules/common/data-table/use-infinite-rows';
import { useRowSelection } from '~/modules/common/data-table/use-row-selection';
import type { EnrichedChannel } from '~/modules/entities/types';
import { isDefaultListView } from '~/query/basic/create-query-keys';

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

export function AttachmentsTable({ channel, canUpload, isSheet = false }: AttachmentsTableProps) {
  const allowUpload = canUpload ?? canUploadAttachments(channel);
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<AttachmentsRouteSearchParams>({ saveDataInSearch: !isSheet });

  // A sub-organization channel carries its organization's id; an organization is its own.
  const organizationId = channel.organizationId ?? channel.id;
  const updateAttachment = useAttachmentUpdateMutation(channel.tenantId, organizationId);

  const { q, sort, order } = search;

  const [columns, setColumns] = useColumnVisibility(useColumns(channel, isSheet));
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  // Default view (no search, default sort) reads the canonical org query that SyncService prefetches; any other filter uses the infinite query.
  const isDefaultView = isDefaultListView({ q, sort, order }, attachmentsSearchDefaults);

  const canonicalOptions = attachmentsCanonicalOptions({ tenantId: channel.tenantId, organizationId });
  const canonical = useQuery({ ...canonicalOptions, enabled: isDefaultView, refetchOnMount: true, select: selectDefaultViewRows });

  const queryOptions = attachmentsListQueryOptions({ tenantId: channel.tenantId, organizationId, q, sort, order });
  const filtered = useInfiniteRows({ ...queryOptions, enabled: !isDefaultView, refetchOnMount: true });

  const { isLoading, isFetching, error } = isDefaultView ? canonical : filtered;
  const rows = isDefaultView ? canonical.data : filtered.rows;
  const { selected, selectedRowIds, onSelectedRowsChange, clearSelection } = useRowSelection(rows);

  const onRowsChange = (changedRows: Attachment[], { indexes, column }: RowsChangeData<Attachment>) => {
    if (column.key !== 'name') return;

    for (const index of indexes) {
      const attachment = changedRows[index];
      updateAttachment.mutate({ id: attachment.id, ops: { name: attachment.name } });
    }
  };

  const NoRowsComponent = (
    <ContentPlaceholder icon={PaperclipIcon} title="c:no_resource_yet" titleProps={{ resource: t('c:attachment_other').toLowerCase() }} />
  );

  return (
    <>
      <AttachmentsTableBar
        channel={channel}
        selected={selected}
        searchVars={search}
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
          error,
          isLoading,
          isFetching,
          isFiltered: !!q,
          hasNextPage: !isDefaultView && filtered.hasNextPage,
          fetchMore: filtered.fetchMore,
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
