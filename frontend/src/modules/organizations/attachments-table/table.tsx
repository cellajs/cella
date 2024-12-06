import { type Dispatch, type SetStateAction, forwardRef, useCallback, useImperativeHandle, useMemo } from 'react';

import { Paperclip } from 'lucide-react';
import type { RowsChangeData } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useDataFromSuspenseInfiniteQuery } from '~/hooks/use-data-from-query';
import { showToast } from '~/lib/toasts';
import { openCarouselDialog } from '~/modules/common/carousel/carousel-dialog';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import { dialog } from '~/modules/common/dialoger/state';
import { useAttachmentUpdateMutation } from '~/modules/common/query-client-provider/mutations/attachments';
import type { AttachmentSearch, AttachmentsTableProps } from '~/modules/organizations/attachments-table';
import { useColumns } from '~/modules/organizations/attachments-table/columns';
import { attachmentsQueryOptions } from '~/modules/organizations/attachments-table/helpers/query-options';
import { useSync } from '~/modules/organizations/attachments-table/helpers/use-sync';
import RemoveAttachmentsForm from '~/modules/organizations/attachments-table/remove-attachments-form';
import { useUserStore } from '~/store/user';
import type { Attachment, BaseTableMethods, BaseTableProps, BaseTableQueryVariables } from '~/types/common';

type BaseAttachmentsTableProps = AttachmentsTableProps &
  BaseTableProps<Attachment> & {
    setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<Attachment>[]>>;
    queryVars: BaseTableQueryVariables<AttachmentSearch>;
  };

const BaseAttachmentsTable = forwardRef<BaseTableMethods, BaseAttachmentsTableProps>(
  ({ organization, tableId, columns, setColumns, sortColumns, setSortColumns, queryVars, isSheet = false }: BaseAttachmentsTableProps, ref) => {
    const { t } = useTranslation();
    const user = useUserStore((state) => state.user);

    useSync(organization.id);

    const { q, sort, order, limit } = queryVars;
    const isAdmin = organization.membership?.role === 'admin' || user?.role === 'admin';
    const isMobile = useBreakpoints('max', 'sm');

    // Query attachments
    const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } =
      useDataFromSuspenseInfiniteQuery(attachmentsQueryOptions({ orgIdOrSlug: organization.id, q, sort, order, limit }));

    const openPreviewDialog = useCallback(
      (slideNum: number) =>
        openCarouselDialog(
          slideNum,
          rows.map((el) => ({ src: el.url, fileType: el.contentType })),
        ),
      [rows],
    );

    useMemo(() => setColumns(useColumns(t, isMobile, isAdmin, isSheet, openPreviewDialog)), [isAdmin, openPreviewDialog]);

    // Table selection
    const selected = useMemo(() => {
      return rows.filter((row) => selectedRows.has(row.id));
    }, [selectedRows, rows]);

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

    const openRemoveDialog = () => {
      dialog(
        <RemoveAttachmentsForm
          organizationId={organization.id}
          dialog
          callback={() => {
            showToast(t('common:success.delete_resources', { resources: t('common:attachments') }), 'success');
          }}
          attachments={selected}
        />,
        {
          className: 'max-w-xl',
          title: t('common:remove_resource', { resource: t('attachment').toLowerCase() }),
          description: t('common:confirm.delete_resources', { resources: t('common:attachments').toLowerCase() }),
        },
      );
    };

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => setSelectedRows(new Set<string>()),
      openRemoveDialog,
    }));

    return (
      <div id={tableId} data-total-count={totalCount} data-selected={selected.length}>
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
            onSortColumnsChange: setSortColumns,
            NoRowsComponent: (
              <ContentPlaceholder Icon={Paperclip} title={t('common:no_resource_yet', { resource: t('common:attachments').toLowerCase() })} />
            ),
          }}
        />
      </div>
    );
  },
);
export default BaseAttachmentsTable;
