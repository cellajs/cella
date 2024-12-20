import { type Dispatch, type SetStateAction, forwardRef, memo, useCallback, useEffect, useImperativeHandle } from 'react';

import { useSearch } from '@tanstack/react-router';
import { Paperclip } from 'lucide-react';
import type { RowsChangeData } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useDataFromSuspenseInfiniteQuery } from '~/hooks/use-data-from-query';
import type { AttachmentSearch, AttachmentsTableProps } from '~/modules/attachments/attachments-table';
import { useColumns } from '~/modules/attachments/attachments-table/columns';
import { attachmentsQueryOptions } from '~/modules/attachments/attachments-table/helpers/query-options';
import { useSync } from '~/modules/attachments/attachments-table/helpers/use-sync';
import { openAttachmentDialog } from '~/modules/attachments/helpers';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import { useAttachmentUpdateMutation } from '~/modules/common/query-client-provider/mutations/attachments';
import { useUserStore } from '~/store/user';
import type { Attachment, BaseTableMethods, BaseTableProps } from '~/types/common';

type BaseDataTableProps = AttachmentsTableProps &
  BaseTableProps<Attachment, AttachmentSearch> & {
    setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<Attachment>[]>>;
  };

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(
    ({ organization, columns, setColumns, queryVars, updateCounts, sortColumns, setSortColumns, isSheet = false }, ref) => {
      const { t } = useTranslation();
      const user = useUserStore((state) => state.user);
      const { attachmentPreview } = useSearch({ strict: false });

      useSync(organization.id);

      const { q, sort, order, limit } = queryVars;

      const isAdmin = organization.membership?.role === 'admin' || user?.role === 'admin';
      const isMobile = useBreakpoints('max', 'sm');

      // Query attachments
      const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } =
        useDataFromSuspenseInfiniteQuery(attachmentsQueryOptions({ orgIdOrSlug: organization.id, q, sort, order, limit }));

      const openDialog = useCallback(
        (slideNum: number) =>
          openAttachmentDialog(
            slideNum,
            rows.map((el) => ({ src: el.url, fileType: el.contentType })),
            true,
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

      // Reopen dialog after reload if the attachmentPreview parameter exists
      useEffect(() => {
        if (!attachmentPreview || !rows || rows.length === 0) return;
        const slides = rows.map((el) => ({ src: el.url, fileType: el.contentType }));
        const slideIndex = slides.findIndex((slide) => slide.src === attachmentPreview);

        // If the slide exists in the slides array, reopen the dialog
        if (slideIndex !== -1) openAttachmentDialog(slideIndex, slides, true);
      }, [attachmentPreview, rows]);

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
    },
  ),
);

export default BaseDataTable;
