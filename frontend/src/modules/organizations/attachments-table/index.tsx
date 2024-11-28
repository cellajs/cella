import { useSearch } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';

import { config } from 'config';
import { motion } from 'framer-motion';
import { Paperclip, Trash, Upload, XSquare } from 'lucide-react';
import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
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
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { dialog } from '~/modules/common/dialoger/state';
import { FocusView } from '~/modules/common/focus-view';
import { useAttachmentUpdateMutation } from '~/modules/common/query-client-provider/mutations/attachments';
import { useColumns } from '~/modules/organizations/attachments-table/columns';
import { openUploadDialog } from '~/modules/organizations/attachments-table/helpers';
import { attachmentsQueryOptions } from '~/modules/organizations/attachments-table/helpers/query-options';
import { useSync } from '~/modules/organizations/attachments-table/helpers/use-sync';
import RemoveAttachmentsForm from '~/modules/organizations/attachments-table/remove-attachments-form';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';
import type { Attachment, Organization } from '~/types/common';
import type { attachmentsQuerySchema } from '#/modules/attachments/schema';

const LIMIT = config.requestLimits.attachments;

type AttachmentSearch = z.infer<typeof attachmentsQuerySchema>;

interface AttachmentsTableProps {
  organization: Organization;
  canUploadAttachments?: boolean;
  isSheet?: boolean;
}

const AttachmentsTable = ({ organization, canUploadAttachments = true, isSheet = false }: AttachmentsTableProps) => {
  const { t } = useTranslation();
  const search = useSearch({ strict: false });
  const user = useUserStore((state) => state.user);

  useSync(organization.id);

  const isAdmin = organization.membership?.role === 'admin' || user?.role === 'admin';
  const isMobile = useBreakpoints('max', 'sm');

  // Table state
  const [q, setQuery] = useState<AttachmentSearch['q']>(search.q);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // Search query options
  const sort = sortColumns[0]?.columnKey as AttachmentSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as AttachmentSearch['order'];
  const limit = LIMIT;

  // Check if table has enabled filtered
  const isFiltered = !!q;

  // Query attachments
  const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } = useDataFromSuspenseInfiniteQuery(
    attachmentsQueryOptions({
      orgIdOrSlug: organization.id,
      q,
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
    const filters = useMemo(() => ({ q, sort, order }), [q, sortColumns]);
    useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });
  }

  // Table selection
  const selected = useMemo(() => {
    return rows.filter((row) => selectedRows.has(row.id));
  }, [selectedRows, rows]);

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
  };

  // Clear selected rows on search
  const onSearch = (searchString: string) => {
    if (selectedRows.size > 0) setSelectedRows(new Set<string>());
    setQuery(searchString);
  };

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

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className={'flex items-center max-sm:justify-between md:gap-2'}>
        {/* Filter bar */}
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            {selected.length > 0 ? (
              <>
                <Button asChild variant="destructive" onClick={openRemoveDialog} className="relative">
                  <motion.button layout="size" layoutRoot transition={{ duration: 0.1 }} layoutId="members-filter-bar-button">
                    <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-1.5 animate-in zoom-in">{selected.length}</Badge>
                    <motion.span layoutId="attachments-filter-bar-icon">
                      <Trash size={16} />
                    </motion.span>

                    <span className="ml-1 max-xs:hidden">{t('common:remove')}</span>
                  </motion.button>
                </Button>

                <Button asChild variant="ghost" onClick={() => setSelectedRows(new Set<string>())}>
                  <motion.button
                    transition={{
                      bounce: 0,
                      duration: 0.2,
                    }}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -20, opacity: 0 }}
                  >
                    <XSquare size={16} />
                    <span className="ml-1">{t('common:clear')}</span>
                  </motion.button>
                </Button>
              </>
            ) : (
              canUploadAttachments &&
              !isFiltered &&
              isAdmin && (
                <Button asChild onClick={() => openUploadDialog(organization.id)}>
                  <motion.button transition={{ duration: 0.1 }} layoutId="attachments-filter-bar-button">
                    <motion.span layoutId="attachments-filter-bar-icon">
                      <Upload size={16} />
                    </motion.span>
                    <span className="ml-1">{t('common:upload')}</span>
                  </motion.button>
                </Button>
              )
            )}
            {!isLoading && selected.length === 0 && (
              <TableCount count={totalCount} type="attachment" isFiltered={isFiltered} onResetFilters={onResetFilters} />
            )}
          </FilterBarActions>
          <div className="sm:grow" />
          <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-left max-sm:fade-in max-sm:duration-300">
            <TableSearch value={q} setQuery={onSearch} />
          </FilterBarContent>
        </TableFilterBar>

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
};

export default AttachmentsTable;
