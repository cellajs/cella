import { ilike, or, useLiveQuery } from '@tanstack/react-db';
import { Paperclip } from 'lucide-react';
import { forwardRef, memo, useEffect, useImperativeHandle } from 'react';
import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import useOfflineTableSearch from '~/hooks/use-offline-table-search';
import { attachmentsQueryOptions } from '~/modules/attachments/query';
import { useAttachmentUpdateMutation } from '~/modules/attachments/query-mutations';
import type { AttachmentSearch, AttachmentsTableProps } from '~/modules/attachments/table/table-wrapper';
import type { Attachment } from '~/modules/attachments/types';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { tablePropsAreEqual } from '~/modules/common/data-table/table-props-are-equal';
import type { BaseTableMethods, BaseTableProps } from '~/modules/common/data-table/types';
import { useDataFromInfiniteQuery } from '~/query/hooks/use-data-from-query';
import { getAttachmentsCollection } from './helpers';

type BaseDataTableProps = AttachmentsTableProps & BaseTableProps<Attachment, AttachmentSearch>;

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(({ entity, columns, searchVars, sortColumns, setSortColumns, setTotal, setSelected }, ref) => {
    const { t } = useTranslation();

    // const [selectedRows, setSelectedRows] = useState(new Set<string>());

    const { q, sort, order, limit } = searchVars;
    const orgIdOrSlug = entity.membership?.organizationId || entity.id;

    const { data } = useLiveQuery(
      (query) => {
        let qBuilder = query
          .from({ attachments: getAttachmentsCollection(orgIdOrSlug) })
          .orderBy(({ attachments }) => (sort && sort !== 'createdAt' ? attachments[sort] : attachments.created_at), order);

        if (typeof q === 'string' && q.trim() !== '') {
          qBuilder = qBuilder.where(({ attachments }) => or(ilike(attachments.name, `%${q}%`), ilike(attachments.filename, `%${q}%`)));
        }

        return qBuilder;
      },
      [q, sort, order],
    );
    console.log('🚀 ~ data:', data);

    // Query attachments
    const {
      rows: fetchedRows,
      selectedRows,
      setRows,
      setSelectedRows,
      totalCount,
      isLoading,
      isFetching,
      error,
      fetchNextPage,
    } = useDataFromInfiniteQuery(attachmentsQueryOptions({ orgIdOrSlug, q, sort, order, limit }));

    const attachmentUpdateMutation = useAttachmentUpdateMutation();

    const rows = useOfflineTableSearch({
      data: fetchedRows,
      filterFn: ({ q }, item) => {
        if (!q) return true;
        const query = q.trim().toLowerCase(); // Normalize query
        return item.name.toLowerCase().includes(query) || item.filename.toLowerCase().includes(query);
      },
      onFilterCallback: (filteredData) => setTotal(filteredData.length),
    });

    // Update rows
    const onRowsChange = (changedRows: Attachment[], { indexes, column }: RowsChangeData<Attachment>) => {
      if (column.key === 'name') {
        // If name is changed, update the attachment
        for (const index of indexes) {
          const attachment = changedRows[index];
          attachmentUpdateMutation.mutate({
            id: attachment.id,
            orgIdOrSlug: entity.id,
            name: attachment.name,
          });
        }
      }

      setRows(changedRows);
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
    // useEffect(() => {
    //   setTotal(data.length);
    //   if (!selectedRows.size) return;
    //   setSelectedRows(new Set<string>([...selectedRows].filter((id) => data.some((row) => row.id === id))));
    // }, [data]);

    // Effect to update total when online totalCount changes
    useEffect(() => setTotal(totalCount), [totalCount]);

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => onSelectedRowsChange(new Set<string>()),
    }));

    return (
      <DataTable<Attachment>
        {...{
          columns: columns.filter((column) => column.visible),
          rowHeight: 52,
          enableVirtualization: false,
          onRowsChange,
          rows,
          limit,
          // totalCount: data.length,
          totalCount,
          rowKeyGetter: (row) => row.id,
          error,
          isLoading,
          isFetching,
          fetchMore: fetchNextPage,
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
