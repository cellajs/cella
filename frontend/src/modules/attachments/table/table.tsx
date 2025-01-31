import { type Dispatch, type SetStateAction, forwardRef, memo, useCallback, useEffect, useImperativeHandle } from 'react';

import { useNavigate, useSearch } from '@tanstack/react-router';
import { Paperclip } from 'lucide-react';
import type { RowsChangeData } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { openAttachmentDialog } from '~/modules/attachments/helpers';
import { attachmentsQueryOptions } from '~/modules/attachments/query';
import { useAttachmentUpdateMutation } from '~/modules/attachments/query-mutations';
import type { AttachmentSearch, AttachmentsTableProps } from '~/modules/attachments/table';
import { useColumns } from '~/modules/attachments/table/columns';
import { useSync } from '~/modules/attachments/table/helpers/use-sync';
import type { Attachment } from '~/modules/attachments/types';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import type { BaseTableMethods, BaseTableProps } from '~/modules/common/data-table/types';
import { dialog } from '~/modules/common/dialoger/state';
import { useDataFromSuspenseInfiniteQuery } from '~/query/hooks/use-data-from-query';
import { useUserStore } from '~/store/user';

type BaseDataTableProps = AttachmentsTableProps &
  BaseTableProps<Attachment, AttachmentSearch> & {
    setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<Attachment>[]>>;
  };

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(
    ({ organization, columns, setColumns, queryVars, updateCounts, sortColumns, setSortColumns, isSheet = false }, ref) => {
      const { t } = useTranslation();
      const navigate = useNavigate();
      const user = useUserStore((state) => state.user);
      const { attachmentPreview } = useSearch({ strict: false });

      useSync(organization.id);

      const { q, sort, order, limit } = queryVars;

      const isAdmin = organization.membership?.role === 'admin' || user?.role === 'admin';
      const isMobile = useBreakpoints('max', 'sm');

      const removeCallback = () => {
        navigate({
          to: '.',
          replace: true,
          resetScroll: false,
          search: (prev) => ({
            ...prev,
            attachmentPreview: undefined,
          }),
        });
      };

      // Query attachments
      const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } =
        useDataFromSuspenseInfiniteQuery(attachmentsQueryOptions({ orgIdOrSlug: organization.id, q, sort, order, limit }));

      const openDialog = useCallback(
        (slideNum: number) =>
          openAttachmentDialog(
            slideNum,
            rows.map((el) => ({ src: el.url, filename: el.filename, name: el.name, fileType: el.contentType })),
            true,
            { removeCallback },
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
        if (!attachmentPreview) return dialog.remove(true, 'attachment-file-preview');
        if (!rows || rows.length === 0) return;
        const slides = rows.map((el) => ({ src: el.url, filename: el.filename, name: el.name, fileType: el.contentType }));
        const slideIndex = slides.findIndex((slide) => slide.src === attachmentPreview);

        // If the slide exists in the slides array, reopen the dialog
        if (slideIndex !== -1) openAttachmentDialog(slideIndex, slides, true, { removeCallback });
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
