import { forwardRef, memo, useEffect, useImperativeHandle, useMemo } from 'react';

import { Paperclip } from 'lucide-react';
import type { RowsChangeData } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { useAttachmentUpdateMutation } from '~/modules/attachments/query/mutations';
import { attachmentsQueryOptions } from '~/modules/attachments/query/options';
import type { AttachmentSearch, AttachmentsTableProps } from '~/modules/attachments/table/table-wrapper';
import type { Attachment } from '~/modules/attachments/types';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { tablePropsAreEqual } from '~/modules/common/data-table/table-props-are-equal';
import type { BaseTableMethods, BaseTableProps } from '~/modules/common/data-table/types';
import { useDataFromInfiniteQuery } from '~/query/hooks/use-data-from-query';

type BaseDataTableProps = AttachmentsTableProps & BaseTableProps<Attachment, AttachmentSearch>;

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(({ entity, columns, searchVars, sortColumns, setSortColumns, setTotal, setSelected }, ref) => {
    const { t } = useTranslation();
    const { isOnline } = useOnlineManager();

    const { q, sort, order, limit } = searchVars;
    const orgIdOrSlug = entity.membership?.organizationId || entity.id;

    // Query attachments
    const {
      rows: fetchedRows,
      selectedRows,
      setRows,
      setSelectedRows,
      totalCount,
      isLoading,
      isFetching,
      error,
      fetchNextPage,
    } = useDataFromInfiniteQuery(attachmentsQueryOptions({ orgIdOrSlug, q, sort, order, limit }));
    const attachmentUpdateMutation = useAttachmentUpdateMutation();

    const rows = useMemo(() => {
      if (isOnline || !q?.trim()) return fetchedRows; // Skip filtering if online or query is empty

      const query = q.trim().toLowerCase(); // Normalize query
      return fetchedRows.filter(({ name, filename }) => name.toLowerCase().includes(query) || filename.toLowerCase().includes(query));
    }, [isOnline, q, fetchedRows]);

    // Update rows
    const onRowsChange = (changedRows: Attachment[], { indexes, column }: RowsChangeData<Attachment>) => {
      if (column.key === 'name') {
        // If name is changed, update the attachment
        for (const index of indexes) {
          const attachment = changedRows[index];
          attachmentUpdateMutation.mutate({
            id: attachment.id,
            orgIdOrSlug: entity.id,
            name: attachment.name,
          });
        }
      }

      setRows(changedRows);
    };

    const onSelectedRowsChange = (value: Set<string>) => {
      setSelectedRows(value);
      setSelected(rows.filter((row) => value.has(row.id)));
    };

    // Effect to update total when online totalCount changes
    useEffect(() => setTotal(totalCount), [totalCount]);

    // Effect to update total when offline and rows filters
    useEffect(() => {
      if (isOnline) return;
      setTotal(rows.length); // Update total when offline and rows.length changes
    }, [isOnline, rows.length]);

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => onSelectedRowsChange(new Set<string>()),
    }));

    return (
      <DataTable<Attachment>
        {...{
          columns: columns.filter((column) => column.visible),
          rowHeight: 50,
          enableVirtualization: false,
          onRowsChange,
          rows,
          limit,
          totalCount,
          rowKeyGetter: (row) => row.id,
          error,
          isLoading,
          isFetching,
          fetchMore: fetchNextPage,
          isFiltered: !!q,
          selectedRows,
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: (
            <ContentPlaceholder Icon={Paperclip} title={t('common:no_resource_yet', { resource: t('common:attachments').toLowerCase() })} />
          ),
        }}
      />
    );
  }),
  tablePropsAreEqual,
);

export default BaseDataTable;
