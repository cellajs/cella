import { ilike, or, useLiveQuery } from '@tanstack/react-db';
import { Paperclip } from 'lucide-react';
import { forwardRef, memo, useEffect, useImperativeHandle, useState } from 'react';
import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { updateAttachment } from '~/api.gen';
import useOfflineTableSearch from '~/hooks/use-offline-table-search';
import type { AttachmentSearch, AttachmentsTableProps } from '~/modules/attachments/table/table-wrapper';
import type { LiveQueryAttachment } from '~/modules/attachments/types';
import { useTransaction } from '~/modules/attachments/use-transaction';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { tablePropsAreEqual } from '~/modules/common/data-table/table-props-are-equal';
import type { BaseTableMethods, BaseTableProps } from '~/modules/common/data-table/types';
import { toaster } from '~/modules/common/toaster';
import { getAttachmentsCollection } from './helpers';

type BaseDataTableProps = AttachmentsTableProps & BaseTableProps<LiveQueryAttachment, AttachmentSearch>;

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(({ entity, columns, searchVars, sortColumns, setSortColumns, setTotal, setSelected }, ref) => {
    const { t } = useTranslation();

    const [selectedRows, setSelectedRows] = useState(new Set<string>());

    const { q, sort, order, limit } = searchVars;
    const orgIdOrSlug = entity.membership?.organizationId || entity.id;

    const attachmentCollection = getAttachmentsCollection(orgIdOrSlug);

    const { data, isLoading } = useLiveQuery(
      (query) => {
        let qBuilder = query
          .from({ attachments: attachmentCollection })
          .orderBy(({ attachments }) => (sort && sort !== 'createdAt' ? attachments[sort] : attachments.created_at), order ?? 'asc');

        if (typeof q === 'string' && q.trim() !== '') {
          qBuilder = qBuilder.where(({ attachments }) => or(ilike(attachments.name, `%${q}%`), ilike(attachments.filename, `%${q}%`)));
        }

        return qBuilder;
      },
      [q, sort, order],
    );

    const updateAttachmentName = useTransaction<LiveQueryAttachment>({
      mutationFn: async ({ transaction }) => {
        await Promise.all(
          transaction.mutations.map(async ({ changes, original }) => {
            try {
              if (!changes.name) return;
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

    const rows = useOfflineTableSearch({
      data,
      filterFn: ({ q }, item) => {
        if (!q) return true;
        const query = q.trim().toLowerCase(); // Normalize query
        return item.name.toLowerCase().includes(query) || item.filename.toLowerCase().includes(query);
      },
      onFilterCallback: (filteredData) => setTotal(filteredData.length),
    });

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
      setSelected(rows.filter((row) => value.has(row.id)));
    };

    const onSortColumnsChange = (sortColumns: SortColumn[]) => {
      setSortColumns(sortColumns);
      onSelectedRowsChange(new Set<string>());
    };

    // Effect to update total and selected rows when data changes
    useEffect(() => {
      setTotal(data.length);
      if (!selectedRows.size) return;
      setSelectedRows(new Set<string>([...selectedRows].filter((id) => data.some((row) => row.id === id))));
    }, [data]);

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
          rows,
          limit,
          totalCount: data.length,
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
