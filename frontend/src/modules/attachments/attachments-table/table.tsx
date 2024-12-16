import { type Dispatch, type SetStateAction, forwardRef, memo, useCallback, useEffect, useImperativeHandle, useState } from 'react';

import { Paperclip } from 'lucide-react';
import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useDataFromSuspenseInfiniteQuery } from '~/hooks/use-data-from-query';
import { attachmentDialog } from '~/modules/attachments/attachment-dialog';
import type { AttachmentSearch, AttachmentsTableProps } from '~/modules/attachments/attachments-table';
import { useColumns } from '~/modules/attachments/attachments-table/columns';
import { attachmentsQueryOptions } from '~/modules/attachments/attachments-table/helpers/query-options';
import { useSync } from '~/modules/attachments/attachments-table/helpers/use-sync';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import { getSortColumns } from '~/modules/common/data-table/sort-columns';
import { useAttachmentUpdateMutation } from '~/modules/common/query-client-provider/mutations/attachments';
import { useUserStore } from '~/store/user';
import type { Attachment, BaseTableMethods, BaseTableProps } from '~/types/common';

type BaseDataTableProps = AttachmentsTableProps &
  BaseTableProps<Attachment, AttachmentSearch> & {
    setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<Attachment>[]>>;
  };

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(
    ({ organization, columns, queryVars, setColumns, setSearch, updateCounts, isSheet = false }, ref) => {
      const { t } = useTranslation();
      const user = useUserStore((state) => state.user);

      const isAdmin = organization.membership?.role === 'admin' || user?.role === 'admin';
      const isMobile = useBreakpoints('max', 'sm');

      useSync(organization.id);

      const { q, sort = 'createdAt', order = 'desc', limit } = queryVars;
      const [sortColumns, setSortColumns] = useState<SortColumn[]>(getSortColumns(order, sort));

      // Update sort
      const updateSort = (newColumnsSort: SortColumn[]) => {
        setSortColumns(newColumnsSort);

        const [sortColumn] = newColumnsSort;
        const { columnKey, direction } = sortColumn;
        setSearch({ sort: columnKey as AttachmentSearch['sort'], order: direction.toLowerCase() as AttachmentSearch['order'] });
      };

      // Query attachments
      const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } =
        useDataFromSuspenseInfiniteQuery(attachmentsQueryOptions({ orgIdOrSlug: organization.id, q, sort, order, limit }));

      const openDialog = useCallback(
        (slideNum: number) =>
          attachmentDialog(
            slideNum,
            rows.map((el) => ({ src: el.url, fileType: el.contentType })),
          ),
        [rows],
      );

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

      useEffect(() => setColumns(useColumns(t, isMobile, isAdmin, isSheet, openDialog)), [isAdmin, openDialog]);

      useEffect(() => {
        updateCounts(
          rows.filter((row) => selectedRows.has(row.id)),
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
            rowHeight: 42,
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
            onSortColumnsChange: updateSort,
            NoRowsComponent: (
              <ContentPlaceholder Icon={Paperclip} title={t('common:no_resource_yet', { resource: t('common:attachments').toLowerCase() })} />
            ),
          }}
        />
      );
    },
  ),
);

export default BaseDataTable;
