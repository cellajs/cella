import { ilike, or, useLiveQuery } from '@tanstack/react-db';
import { Paperclip } from 'lucide-react';
import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { updateAttachment } from '~/api.gen';
import { getAttachmentsCollection, getLocalAttachmentsCollection } from '~/modules/attachments/query';
import type { AttachmentSearch, AttachmentsTableProps } from '~/modules/attachments/table/table-wrapper';
import type { LiveQueryAttachment } from '~/modules/attachments/types';
import { useTransaction } from '~/modules/attachments/use-transaction';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { tablePropsAreEqual } from '~/modules/common/data-table/table-props-are-equal';
import type { BaseTableMethods, BaseTableProps } from '~/modules/common/data-table/types';
import { toaster } from '~/modules/common/toaster';

type BaseDataTableProps = AttachmentsTableProps & BaseTableProps<LiveQueryAttachment, AttachmentSearch>;

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(({ entity, columns, searchVars, sortColumns, setSortColumns, setTotal, setSelected }, ref) => {
    const { t } = useTranslation();

    const [selectedRows, setSelectedRows] = useState(new Set<string>());

    const { q, sort, order, limit } = searchVars;
    const orgIdOrSlug = entity.membership?.organizationId || entity.id;
    const attachmentCollection = getAttachmentsCollection(orgIdOrSlug);
    const localAttachmentCollection = getLocalAttachmentsCollection(orgIdOrSlug);

    const { data, isLoading } = useLiveQuery(
      (query) => {
        let qBuilder = query.from({ attachments: attachmentCollection });
        if (typeof q === 'string' && q.trim() !== '') {
          qBuilder = qBuilder.where(({ attachments }) => or(ilike(attachments.name, `%${q}%`), ilike(attachments.filename, `%${q}%`)));
        }

        return qBuilder;
      },
      [q, sort, order],
    );

    const { data: local } = useLiveQuery(
      (query) => {
        let qBuilder = query.from({ localAttachments: localAttachmentCollection });
        if (typeof q === 'string' && q.trim() !== '') {
          qBuilder = qBuilder.where(({ localAttachments }) => or(ilike(localAttachments.name, `%${q}%`), ilike(localAttachments.filename, `%${q}%`)));
        }

        return qBuilder;
      },
      [q, sort, order],
    );

    const combined = useMemo(() => {
      const all = [...(data ?? []), ...(local ?? [])];

      return all.sort((a, b) => {
        const key = sort && sort !== 'createdAt' ? sort : 'created_at';
        const aValue = a[key];
        const bValue = b[key];

        if (aValue == null) return 1;
        if (bValue == null) return -1;

        // Handle date or string intelligently
        if (aValue > bValue) return order === 'desc' ? -1 : 1;
        if (aValue < bValue) return order === 'desc' ? 1 : -1;
        return 0;
      });
    }, [data, local, sort, order]);

    const updateAttachmentName = useTransaction<LiveQueryAttachment>({
      mutationFn: async ({ transaction }) => {
        await Promise.all(
          transaction.mutations.map(async ({ type, changes, original }) => {
            try {
              if (!changes.name || type !== 'update') return;
              const originalAttachment = original as LiveQueryAttachment;

              await updateAttachment({
                body: { name: changes.name },
                path: { id: originalAttachment.id, orgIdOrSlug: originalAttachment.organization_id },
              });
            } catch {
              toaster(t('error:update_resource', { resource: t('common:attachment') }), 'error');
            }
          }),
        );
      },
    });

    // const rows = useOfflineTableSearch({
    //   data: combined,
    //   filterFn: ({ q }, item) => {
    //     if (!q) return true;
    //     const query = q.trim().toLowerCase(); // Normalize query
    //     return item.name.toLowerCase().includes(query) || item.filename.toLowerCase().includes(query);
    //   },
    //   onFilterCallback: (filteredData) => setTotal(filteredData.length),
    // });

    // Update rows
    const onRowsChange = (changedRows: LiveQueryAttachment[], { column }: RowsChangeData<LiveQueryAttachment>) => {
      if (column.key === 'name') {
        updateAttachmentName.mutate(() => {
          for (const changedRow of changedRows) {
            attachmentCollection.update(changedRow.id, (draft) => {
              draft.name = changedRow.name;
            });
          }
        });
      }
    };

    const onSelectedRowsChange = (value: Set<string>) => {
      setSelectedRows(value);
      // setSelected(rows.filter((row) => value.has(row.id)));
      setSelected(combined.filter((row) => value.has(row.id)));
    };

    const onSortColumnsChange = (sortColumns: SortColumn[]) => {
      setSortColumns(sortColumns);
      onSelectedRowsChange(new Set<string>());
    };

    // Effect to update total and selected rows when data changes
    useEffect(() => setTotal(combined.length), [combined]);

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => onSelectedRowsChange(new Set<string>()),
    }));

    return (
      <DataTable<LiveQueryAttachment>
        {...{
          columns: columns.filter((column) => column.visible),
          rowHeight: 52,
          enableVirtualization: false,
          onRowsChange,
          rows: combined,
          limit,
          totalCount: combined.length,
          rowKeyGetter: (row) => row.id,
          // error,
          isLoading,
          // isFetching,
          // fetchMore: fetchNextPage,
          isFiltered: !!q,
          selectedRows,
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: (
            <ContentPlaceholder icon={Paperclip} title={t('common:no_resource_yet', { resource: t('common:attachments').toLowerCase() })} />
          ),
        }}
      />
    );
  }),
  tablePropsAreEqual,
);

export default BaseDataTable;
