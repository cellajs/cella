import { forwardRef, memo, useEffect, useImperativeHandle } from 'react';

import { Paperclip } from 'lucide-react';
import type { RowsChangeData } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { attachmentsQueryOptions } from '~/modules/attachments/query';
import { useAttachmentUpdateMutation } from '~/modules/attachments/query-mutations';
import { useSync } from '~/modules/attachments/table/helpers/use-sync';
import type { AttachmentSearch, AttachmentsTableProps } from '~/modules/attachments/table/table-wrapper';
import type { Attachment } from '~/modules/attachments/types';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { tablePropsAreEqual } from '~/modules/common/data-table/table-props-are-equal';
import type { BaseTableMethods, BaseTableProps } from '~/modules/common/data-table/types';
import { useDataFromSuspenseInfiniteQuery } from '~/query/hooks/use-data-from-query';

type BaseDataTableProps = AttachmentsTableProps & BaseTableProps<Attachment, AttachmentSearch>;

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(({ organization, columns, queryVars, updateCounts, sortColumns, setSortColumns }, ref) => {
    const { t } = useTranslation();

    useSync(organization.id);

    const { q, sort, order, limit } = queryVars;

    // Query attachments
    const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } =
      useDataFromSuspenseInfiniteQuery(attachmentsQueryOptions({ orgIdOrSlug: organization.id, q, sort, order, limit }));

    const attachmentUpdateMutation = useAttachmentUpdateMutation();
    // Update rows
    const onRowsChange = (changedRows: Attachment[], { indexes, column }: RowsChangeData<Attachment>) => {
      if (column.key === 'name') {
        // If name is changed, update the attachment
        for (const index of indexes) {
          const attachment = changedRows[index];
          attachmentUpdateMutation.mutate({
            id: attachment.id,
            orgIdOrSlug: organization.id,
            name: attachment.name,
          });
        }
      }

      setRows(changedRows);
    };

    useEffect(() => {
      updateCounts(
        rows.filter(({ id }) => selectedRows.has(id)),
        totalCount,
      );
    }, [selectedRows, rows, totalCount]);

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => setSelectedRows(new Set<string>()),
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
          onSelectedRowsChange: setSelectedRows,
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
