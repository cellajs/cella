import { useQuery } from '@tanstack/react-query';
import { PaperclipIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Attachment } from 'sdk';
import { useSearchParams } from '~/hooks/use-search-params';
import { useCanUploadAttachments } from '~/modules/attachment/helpers/use-can-upload-attachments';
import { attachmentsCanonicalOptions, attachmentsListQueryOptions, useAttachmentUpdateMutation } from '~/modules/attachment/query';
import { attachmentsSearchDefaults } from '~/modules/attachment/search-params-schemas';
import { AttachmentsTableBar } from '~/modules/attachment/table/attachments-bar';
import { useColumns } from '~/modules/attachment/table/attachments-columns';
import type { AttachmentsRouteSearchParams } from '~/modules/attachment/types';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import type { RowsChangeData } from '~/modules/common/data-grid';
import { DataTable, rowKeyById } from '~/modules/common/data-table/data-table';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { useColumnVisibility } from '~/modules/common/data-table/use-column-visibility';
import { useInfiniteRows } from '~/modules/common/data-table/use-infinite-rows';
import { useRowSelection } from '~/modules/common/data-table/use-row-selection';
import { SearchScope } from '~/modules/common/match-highlight/match-scope';
import { channelOrganizationId } from '~/modules/entities/channel-organization-id';
import type { EnrichedChannel } from '~/modules/entities/types';
import { isDefaultListView } from '~/query/basic/create-query-keys';

/** Default-view rows from the canonical query in the server's default order; outside the component, so the getter stays stable. */
function selectDefaultViewRows({ items }: { items: Attachment[] }) {
  const { sort, order } = attachmentsSearchDefaults;
  const direction = order === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => (a[sort] < b[sort] ? -direction : a[sort] > b[sort] ? direction : 0));
}

export interface AttachmentsTableProps {
  channel: EnrichedChannel;
  isSheet?: boolean;
  /** Override for special contexts; defaults to the caller's create permission on the channel. */
  canUpload?: boolean;
}

export function AttachmentsTable({ channel, canUpload, isSheet = false }: AttachmentsTableProps) {
  const uploadAllowed = useCanUploadAttachments(channel);
  const allowUpload = canUpload ?? uploadAllowed;
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<AttachmentsRouteSearchParams>({ saveDataInSearch: !isSheet, defaults: attachmentsSearchDefaults });

  const organizationId = channelOrganizationId(channel);
  const updateAttachment = useAttachmentUpdateMutation(channel.tenantId, organizationId);

  const { q, sort, order } = search;

  const [columns, setColumns] = useColumnVisibility(useColumns(channel, isSheet));
  const { sortColumns, setSortColumns: onSortColumnsChange } = useSortColumns(sort, order, setSearch);

  // Default view (no search, default sort) reads the canonical org query that SyncService prefetches; any other filter uses the infinite query.
  const isDefaultView = isDefaultListView({ q, sort, order }, attachmentsSearchDefaults);

  const canonicalOptions = attachmentsCanonicalOptions({ tenantId: channel.tenantId, organizationId });
  const canonical = useQuery({ ...canonicalOptions, enabled: isDefaultView, select: selectDefaultViewRows });

  const queryOptions = attachmentsListQueryOptions({ tenantId: channel.tenantId, organizationId, q, sort, order });
  const filtered = useInfiniteRows({ ...queryOptions, enabled: !isDefaultView });

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

  const NoRowsComponent = <ContentPlaceholder icon={PaperclipIcon} title="c:no_resource_yet" titleOptions={{ resource: t('c:attachment_other') }} />;

  return (
    <>
      <AttachmentsTableBar
        channel={channel}
        selected={selected}
        searchVars={{ q, sort, order }}
        setSearch={setSearch}
        columns={columns}
        setColumns={setColumns}
        clearSelection={clearSelection}
        isSheet={isSheet}
        canUpload={allowUpload}
        queryKey={isDefaultView ? canonicalOptions.queryKey : queryOptions.queryKey}
      />
      <SearchScope q={q}>
        <DataTable<Attachment>
          {...{
            rows,
            onRowsChange,
            rowKeyGetter: rowKeyById,
            columns,
            enableVirtualization: true,
            error,
            isLoading,
            isFetching,
            isFiltered: !!q,
            onResetFilters: () => setSearch({ q: '' }),
            hasNextPage: !isDefaultView && filtered.hasNextPage,
            fetchMore: filtered.fetchMore,
            selectedRows: selectedRowIds,
            onSelectedRowsChange,
            sortColumns,
            onSortColumnsChange,
            NoRowsComponent,
          }}
        />
      </SearchScope>
    </>
  );
}
