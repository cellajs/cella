import { useSearch } from '@tanstack/react-router';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from 'react';

import { config } from 'config';
import { Paperclip } from 'lucide-react';
import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useDataFromSuspenseInfiniteQuery } from '~/hooks/use-data-from-query';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { showToast } from '~/lib/toasts';
import { openCarouselDialog } from '~/modules/common/carousel/carousel-dialog';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import ColumnsView from '~/modules/common/data-table/columns-view';
import { getInitialSortColumns } from '~/modules/common/data-table/sort-columns';
import { dialog } from '~/modules/common/dialoger/state';
import { FocusView } from '~/modules/common/focus-view';
import { useAttachmentUpdateMutation } from '~/modules/common/query-client-provider/mutations/attachments';
import type { AttachmentSearch, AttachmentsTableProps } from '~/modules/organizations/attachments-table';
import { useColumns } from '~/modules/organizations/attachments-table/columns';
import { attachmentsQueryOptions } from '~/modules/organizations/attachments-table/helpers/query-options';
import { useSync } from '~/modules/organizations/attachments-table/helpers/use-sync';
import RemoveAttachmentsForm from '~/modules/organizations/attachments-table/remove-attachments-form';
import { useUserStore } from '~/store/user';
import type { Attachment, BaseTableMethods } from '~/types/common';

const LIMIT = config.requestLimits.attachments;

type BaseAttachmentsTableProps = AttachmentsTableProps & {
  tableId: string;
  tableFilterBar: React.ReactNode;
};

export const BaseAttachmentsTable = forwardRef<BaseTableMethods, BaseAttachmentsTableProps>(
  ({ organization, tableId, tableFilterBar, isSheet = false }: BaseAttachmentsTableProps, ref) => {
    const { t } = useTranslation();
    const search = useSearch({ strict: false });
    const user = useUserStore((state) => state.user);

    useSync(organization.id);

    const isAdmin = organization.membership?.role === 'admin' || user?.role === 'admin';
    const isMobile = useBreakpoints('max', 'sm');

    // Table state
    const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

    // Search query options
    const sort = sortColumns[0]?.columnKey as AttachmentSearch['sort'];
    const order = sortColumns[0]?.direction.toLowerCase() as AttachmentSearch['order'];
    const limit = LIMIT;

    // Check if table has enabled filtered
    const isFiltered = !!search.q;

    // Query attachments
    const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } =
      useDataFromSuspenseInfiniteQuery(
        attachmentsQueryOptions({
          orgIdOrSlug: organization.id,
          q: search.q,
          sort,
          order,
          limit,
        }),
      );

    const openPreviewDialog = useCallback(
      (slideNum: number) =>
        openCarouselDialog(
          slideNum,
          rows.map((el) => ({ src: el.url, fileType: el.contentType })),
        ),
      [rows],
    );

    // Build columns
    const [columns, setColumns] = useState<ColumnOrColumnGroup<Attachment>[]>([]);
    useMemo(() => setColumns(useColumns(t, isMobile, isAdmin, isSheet, openPreviewDialog)), [isAdmin, openPreviewDialog]);

    const attachmentUpdateMutation = useAttachmentUpdateMutation();

    // Save filters in search params
    if (!isSheet) {
      const filters = useMemo(() => ({ sort, order }), [sortColumns]);
      useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });
    }

    // Table selection
    const selected = useMemo(() => {
      return rows.filter((row) => selectedRows.has(row.id));
    }, [selectedRows, rows]);

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
      <div id={tableId} data-total-count={totalCount} data-selected={selected.length} className="flex flex-col gap-4 h-full">
        <div className={'flex items-center max-sm:justify-between md:gap-2'}>
          {/* Filter bar */}
          {tableFilterBar}

          {/* Columns view */}
          <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

          {/* Focus view */}
          {!isSheet && <FocusView iconOnly />}
        </div>

        {/* Data table */}
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
            isFiltered,
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
