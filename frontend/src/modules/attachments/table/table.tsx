import { forwardRef, memo, useEffect, useImperativeHandle, useState } from 'react';

import { useInfiniteQuery } from '@tanstack/react-query';
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
import { attachmentsQueryOptions } from '../query';

type BaseDataTableProps = AttachmentsTableProps & BaseTableProps<Attachment, AttachmentSearch>;

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(
    ({ organization, columns, queryVars, sortColumns, setSortColumns, setTotal, setSelected }, ref) => {
      const { t } = useTranslation();

      const { q, sort, order, limit } = queryVars;

      // Table state
      const [rows, setRows] = useState<Attachment[]>([]);
      const [selectedRows, setSelectedRows] = useState(new Set<string>());
      const [totalCount, setTotalCount] = useState(0);

      // Fetching attachments
      const {
        data: queryResult,
        fetchNextPage,
        // hasNextPage,
        isFetchingNextPage: isFetching,
        isLoading,
        error,
      } = useInfiniteQuery({
        ...attachmentsQueryOptions({ orgIdOrSlug: organization.id, q, sort, order, limit: 10 }),
        getNextPageParam: (_lastPage, allPages) => allPages.length,
      });

      // 🚀 Flatten paginated data
      useEffect(() => {
        if (!queryResult) return;

        // Flatten the array of pages to get all items
        const data = queryResult.pages?.flatMap((page) => page.items);
        if (!data) return;

        // Update total count
        setTotalCount(queryResult.pages?.[queryResult.pages.length - 1]?.total ?? 0);

        // Update selected rows
        if (selectedRows.size > 0) {
          setSelectedRows(new Set<string>([...selectedRows].filter((id) => data.some((row) => row.id === id))));
        }

        setRows(data);
      }, [queryResult]);

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

      const onSelectedRowsChange = (value: Set<string>) => {
        setSelectedRows(value);
        setSelected(rows.filter((row) => value.has(row.id)));
      };

      useEffect(() => setTotal(totalCount), [totalCount]);

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
    },
  ),
  tablePropsAreEqual,
);

export default BaseDataTable;
