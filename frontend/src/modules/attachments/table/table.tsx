import { forwardRef, memo, useEffect, useImperativeHandle, useState } from 'react';

import { useLoaderData } from '@tanstack/react-router';
import { Paperclip } from 'lucide-react';
import type { RowsChangeData } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { useAttachmentUpdateMutation } from '~/modules/attachments/query-mutations';
import type { AttachmentSearch, AttachmentsTableProps } from '~/modules/attachments/table/table-wrapper';
import type { Attachment } from '~/modules/attachments/types';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { tablePropsAreEqual } from '~/modules/common/data-table/table-props-are-equal';
import type { BaseTableMethods, BaseTableProps } from '~/modules/common/data-table/types';
import { OrganizationAttachmentsRoute } from '~/routes/organizations';

type BaseDataTableProps = AttachmentsTableProps & BaseTableProps<Attachment, AttachmentSearch>;

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(({ organization, columns, queryVars, sortColumns, setSortColumns, setSelected }, ref) => {
    const { t } = useTranslation();

    const { q, limit } = queryVars;

    // Table state
    const [selectedRows, setSelectedRows] = useState(new Set<string>());

    // Fetching data
    const { data: rows, nextCursor, totalCount, error, isLoading } = useLoaderData({ from: OrganizationAttachmentsRoute.id });

    // 🚀 Flatten paginated data
    useEffect(() => {
      if (!rows) return;

      // Update selected rows
      if (selectedRows.size > 0) {
        setSelectedRows(new Set<string>([...selectedRows].filter((id) => rows.some((row) => row.id === id))));
      }
    }, [rows]);
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

      // TODO
      // setRows(changedRows);
    };

    const onSelectedRowsChange = (value: Set<string>) => {
      setSelectedRows(value);
      setSelected(rows.filter((row) => value.has(row.id)));
    };

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => onSelectedRowsChange(new Set<string>()),
    }));

    return (
      // TODO
      // @ts-expect-error
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
          isFetching: isLoading,
          nextCursor,
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
