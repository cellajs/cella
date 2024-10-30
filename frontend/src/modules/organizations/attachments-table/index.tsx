import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';

import { type ChangeMessage, ShapeStream, type ShapeStreamOptions } from '@electric-sql/client';
import { config } from 'config';
import { motion } from 'framer-motion';
import { Trash, Upload, XSquare } from 'lucide-react';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useDebounce } from '~/hooks/use-debounce';
import useMapQueryDataToRows from '~/hooks/use-map-query-data-to-rows';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { queryClient } from '~/lib/router';
import { showToast } from '~/lib/toasts';
import { DataTable } from '~/modules/common/data-table';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import ColumnsView from '~/modules/common/data-table/columns-view';
import { getInitialSortColumns } from '~/modules/common/data-table/sort-columns';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { dialog } from '~/modules/common/dialoger/state';
import { FocusView } from '~/modules/common/focus-view';
import { type AttachmentInfiniteQueryFnData, useAttachmentCreateMutation } from '~/modules/common/query-client-provider/attachments';
import UploadUppy from '~/modules/common/upload/upload-uppy';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { useGeneralStore } from '~/store/general';
import { useUserStore } from '~/store/user';
import { type Attachment, type Organization, UploadType } from '~/types/common';
import { objectKeys } from '~/utils/object';
import type { attachmentsQuerySchema } from '#/modules/attachments/schema';
import { useColumns } from './columns';
import { attachmentsQueryOptions } from './helpers/query-options';
import RemoveAttachmentsForm from './remove-attachments-form';

const LIMIT = 40;

type AttachmentSearch = z.infer<typeof attachmentsQuerySchema>;

type RawAttachment = {
  id: string;
  filename: string;
  content_type: string;
  size: string;
  organization_id: string;
  created_at: string;
  created_by: string;
  modified_at: string;
  modified_by: string;
};

interface AttachmentsTableProps {
  organization: Organization;
  isSheet?: boolean;
}

const attachmentShape = (organization_id?: string): ShapeStreamOptions => ({
  url: new URL('/v1/shape/attachments', config.electricUrl).href,
  where: organization_id ? `organization_id = '${organization_id}'` : undefined,
  backoffOptions: {
    initialDelay: 500,
    maxDelay: 32000,
    multiplier: 2,
  },
});

const AttachmentsTable = ({ organization, isSheet = false }: AttachmentsTableProps) => {
  const { t } = useTranslation();
  const search = useSearch({ strict: false });
  const containerRef = useRef(null);
  const user = useUserStore((state) => state.user);
  const { networkMode } = useGeneralStore();

  const isAdmin = organization.membership?.role === 'admin' || user?.role === 'admin';

  const isMobile = useBreakpoints('max', 'sm');

  const [rows, setRows] = useState<Attachment[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [query, setQuery] = useState<AttachmentSearch['q']>(search.q);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // Search query options
  const q = useDebounce(query, 200);
  const sort = sortColumns[0]?.columnKey as AttachmentSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as AttachmentSearch['order'];
  const limit = LIMIT;

  // Check if table has enabled filtered
  const isFiltered = !!q;

  // Query attachments
  const queryResult = useSuspenseInfiniteQuery(
    attachmentsQueryOptions({
      orgIdOrSlug: organization.id,
      q,
      sort,
      order,
      limit,
      rowsLength: rows.length,
    }),
  );

  // Total count
  const totalCount = queryResult.data?.pages[0].total;

  // Build columns
  const [columns, setColumns] = useState<ColumnOrColumnGroup<Attachment>[]>([]);
  useMemo(() => setColumns(useColumns(t, isMobile, isAdmin, isSheet)), [isAdmin]);
  // Map (updated) query data to rows
  useMapQueryDataToRows<Attachment>({ queryResult, setSelectedRows, setRows, selectedRows });

  const { mutate: createAttachment } = useAttachmentCreateMutation();

  // Save filters in search params
  if (!isSheet) {
    const filters = useMemo(
      () => ({
        q,
        sort,
        order,
      }),
      [q, sortColumns],
    );
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

  // Drop selected Rows on search
  const onSearch = (searchString: string) => {
    if (selectedRows.size > 0) setSelectedRows(new Set<string>());
    setQuery(searchString);
  };

  // Open the upload dialog
  const openUploadDialog = () => {
    dialog(
      <Suspense>
        <UploadUppy
          isPublic={true}
          uploadType={UploadType.Personal}
          uppyOptions={{
            restrictions: {
              maxFileSize: 10 * 1024 * 1024, // 10MB
              maxNumberOfFiles: 1,
              allowedFileTypes: ['*/*'],
              minFileSize: null,
              maxTotalFileSize: 10 * 1024 * 1024, // 10MB
              minNumberOfFiles: null,
              requiredMetaFields: [],
            },
          }}
          plugins={['webcam', 'image-editor', 'screen-capture', 'audio']}
          imageMode="attachment"
          callback={(result) => {
            for (const res of result) {
              createAttachment({
                url: res.url,
                size: String(res.file.size || 0),
                contentType: res.file.type,
                filename: res.file.name || 'unknown',
                organizationId: organization.id,
              });
            }
            dialog.remove(true, 'upload-attachment');
          }}
        />
      </Suspense>,
      {
        id: 'upload-attachment',
        drawerOnMobile: false,
        title: t('common:upload_attachment'),
        className: 'md:max-w-xl',
      },
    );
  };

  const openRemoveDialog = () => {
    dialog(
      <RemoveAttachmentsForm
        organizationId={organization.id}
        dialog
        callback={() => {
          showToast(t('common:success.delete_attachments'), 'success');
        }}
        attachments={selected}
      />,
      {
        className: 'max-w-xl',
        title: t('common:remove_resource', { resource: t('attachment').toLowerCase() }),
        description: t('common:confirm.remove_attachments'),
      },
    );
  };

  useEffect(() => {
    setSortColumns(getInitialSortColumns(search));
  }, [search, organization.id]);

  // Subscribe to task updates
  useEffect(() => {
    if (networkMode !== 'online' || !config.has.sync) return;

    const shapeStream = new ShapeStream<RawAttachment>(attachmentShape(organization.id));
    const unsubscribe = shapeStream.subscribe((messages) => {
      const createMessage = messages.find((m) => m.headers.operation === 'insert') as ChangeMessage<RawAttachment> | undefined;
      if (createMessage) {
        const value = createMessage.value;
        queryClient.setQueryData<AttachmentInfiniteQueryFnData>(attachmentsQueryOptions({ orgIdOrSlug: organization.id }).queryKey, (data) => {
          if (!data) return;
          const created = {} as unknown as Attachment;
          // TODO: Refactor
          for (const key of objectKeys(value)) {
            if (key === 'content_type') {
              created.contentType = value[key];
            } else if (key === 'organization_id') {
              created.organizationId = value[key];
            } else if (key === 'created_at') {
              created.createdAt = value[key];
            } else if (key === 'created_by') {
              created.createdBy = value[key];
            } else if (key === 'modified_at') {
              created.modifiedAt = value[key];
            } else if (key === 'modified_by') {
              created.modifiedBy = value[key];
            } else {
              created[key] = value[key] as never;
            }
          }
          return {
            ...data,
            pages: [
              {
                ...data.pages[0],
                items: [created, ...data.pages[0].items],
              },
              ...data.pages.slice(1),
            ],
          };
        });
      }

      const deleteMessage = messages.find((m) => m.headers.operation === 'delete') as ChangeMessage<RawAttachment> | undefined;
      if (deleteMessage) {
        queryClient.setQueryData<AttachmentInfiniteQueryFnData>(attachmentsQueryOptions({ orgIdOrSlug: organization.id }).queryKey, (data) => {
          if (!data) return;
          return {
            ...data,
            pages: [
              {
                ...data.pages[0],
                items: data.pages[0].items.filter((item) => item.id !== deleteMessage.value.id),
              },
              ...data.pages.slice(1),
            ],
          };
        });
      }
    });
    return () => {
      unsubscribe();
    };
  }, [networkMode]);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className={'flex items-center max-sm:justify-between md:gap-2'}>
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
              !isFiltered &&
              isAdmin && (
                <Button asChild onClick={openUploadDialog}>
                  <motion.button transition={{ duration: 0.1 }} layoutId="attachments-filter-bar-button">
                    <motion.span layoutId="attachments-filter-bar-icon">
                      <Upload size={16} />
                    </motion.span>
                    <span className="ml-1">{t('common:upload')}</span>
                  </motion.button>
                </Button>
              )
            )}
            {selected.length === 0 && <TableCount count={totalCount} type="attachment" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
          </FilterBarActions>
          <div className="sm:grow" />
          <FilterBarContent className="max-sm:animate-in max-sm:slide-in-from-left max-sm:fade-in max-sm:duration-300">
            <TableSearch value={query} setQuery={onSearch} />
          </FilterBarContent>
        </TableFilterBar>
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
        {!isSheet && <FocusView iconOnly />}
      </div>
      <div ref={containerRef} />
      <DataTable<Attachment>
        {...{
          columns: columns.filter((column) => column.visible),
          rowHeight: 42,
          enableVirtualization: false,
          // onRowsChange,
          rows,
          limit,
          totalCount,
          rowKeyGetter: (row) => row.id,
          error: queryResult.error,
          isLoading: queryResult.isLoading,
          isFetching: queryResult.isFetching,
          fetchMore: queryResult.fetchNextPage,
          isFiltered,
          selectedRows,
          onSelectedRowsChange: setSelectedRows,
          sortColumns,
          onSortColumnsChange: setSortColumns,
        }}
      />
    </div>
  );
};

export default AttachmentsTable;