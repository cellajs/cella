import { ilike, or, useLiveQuery } from '@tanstack/react-db';
import { Paperclip } from 'lucide-react';
import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import useOfflineTableSearch from '~/hooks/use-offline-table-search';
import { getAttachmentsCollection, getLocalAttachmentsCollection } from '~/modules/attachments/query';
import type { AttachmentSearch, AttachmentsTableProps } from '~/modules/attachments/table/table-wrapper';
import type { LiveQueryAttachment } from '~/modules/attachments/types';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { tablePropsAreEqual } from '~/modules/common/data-table/table-props-are-equal';
import type { BaseTableMethods, BaseTableProps } from '~/modules/common/data-table/types';

type BaseDataTableProps = AttachmentsTableProps & BaseTableProps<LiveQueryAttachment, AttachmentSearch>;

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(({ entity, columns, searchVars, sortColumns, setSortColumns, setTotal, setSelected }, ref) => {
    const { t } = useTranslation();
    // const { isOnline } = useOnlineManager();
    const [selectedRows, setSelectedRows] = useState(new Set<string>());

    const { q, sort, order, limit } = searchVars;
    const orgIdOrSlug = entity.membership?.organizationId || entity.id;

    // Get attachment collections (remote backend and local)
    const { collection: attachmentCollection } = getAttachmentsCollection(orgIdOrSlug);
    const localAttachmentCollection = getLocalAttachmentsCollection(orgIdOrSlug);

    // Query backend attachment collection
    const { data: backendAttachments, isLoading: backendIsLoading } = useLiveQuery(
      (query) => {
        let qBuilder = query.from({ attachments: attachmentCollection });

        // If a search query string is provided, filter by name or filename (case-insensitive, partial match)
        if (typeof q === 'string' && q.trim() !== '') {
          qBuilder = qBuilder.where(({ attachments }) => or(ilike(attachments.name, `%${q}%`), ilike(attachments.filename, `%${q}%`)));
        }

        return qBuilder;
      },
      [q, sort, order],
    );

    // Query local attachment collection
    const { data: localAttachments, isLoading: localIsLoading } = useLiveQuery(
      (query) => {
        let qBuilder = query.from({ localAttachments: localAttachmentCollection });

        if (typeof q === 'string' && q.trim() !== '') {
          qBuilder = qBuilder.where(({ localAttachments }) => or(ilike(localAttachments.name, `%${q}%`), ilike(localAttachments.filename, `%${q}%`)));
        }

        return qBuilder;
      },
      [q, sort, order],
    );

    // Combine attachment arrays and sort them
    const combined = useMemo(() => {
      const all = [...(backendAttachments ?? []), ...(localAttachments ?? [])];

      // Sort combined array by sort and order
      return all.sort((a, b) => {
        const key = sort && sort !== 'createdAt' ? sort : 'created_at';
        const aValue = a[key];
        const bValue = b[key];

        if (aValue == null) return 1; // Null values go last
        if (bValue == null) return -1;

        // Compare string or date values appropriately
        if (aValue > bValue) return order === 'desc' ? -1 : 1;
        if (aValue < bValue) return order === 'desc' ? 1 : -1;
        return 0;
      });
    }, [backendAttachments, localAttachments, sort, order]);

    // Use a custom hook to filter combined rows offline based on search query,
    const rows = useOfflineTableSearch({
      data: combined,
      filterFn: ({ q }, item) => {
        if (!q) return true;
        // Normalize search query to lowercase and trim whitespace
        const query = q.trim().toLowerCase();
        return item.name.toLowerCase().includes(query) || item.filename.toLowerCase().includes(query);
      },
      onFilterCallback: (filteredData) => setTotal(filteredData.length),
    });

    // Update rows
    const onRowsChange = (changedRows: LiveQueryAttachment[], { column }: RowsChangeData<LiveQueryAttachment>) => {
      if (column.key !== 'name') return;
      const attachmentCollectionRows = changedRows.filter(({ id }) => attachmentCollection.has(id));
      const localAttachmentCollectionRows = changedRows.filter(({ id }) => localAttachmentCollection.has(id));

      for (const changedRow of attachmentCollectionRows) {
        attachmentCollection.update(changedRow.id, (draft) => {
          draft.name = changedRow.name;
        });
      }
      for (const changedRow of localAttachmentCollectionRows) {
        localAttachmentCollection.update(changedRow.id, (draft) => {
          draft.name = changedRow.name;
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
    useEffect(() => setTotal(combined.length), [combined]);

    //TODO (TanStackDB) make work with Strict mode
    // useEffect(() => {
    //   if (!controller) return;
    //   const aborted = controller.signal.aborted;
    //   const handleAbort = () => controller.abort();
    //   if (!isOnline && !aborted) handleAbort();

    //   return () => {
    //     if (!aborted) handleAbort();
    //   };
    // }, [isOnline]);

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
          totalCount: rows.length,
          rowKeyGetter: (row) => row.id,
          // error,
          isLoading: backendIsLoading && localIsLoading,
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
