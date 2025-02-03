import { Bird } from 'lucide-react';
import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import type { InvitesProps, InvitesSearch } from '~/modules/organizations/invites/table';
import type { BaseTableMethods, BaseTableProps, OrganizationInvites } from '~/types/common';

type BaseDataTableProps = InvitesProps & BaseTableProps<OrganizationInvites, InvitesSearch> & { queryVars: { role: InvitesSearch['role'] } };

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(({ info, columns, queryVars, updateCounts, sortColumns, setSortColumns }, ref) => {
    const { t } = useTranslation();

    // Extract query variables and set defaults
    const { q, sort, order, role, limit } = queryVars;

    const [rows, setRows] = useState<OrganizationInvites[]>(info);

    // Handle sorting and filtering
    const filteredAndSortedRows = useMemo(() => {
      let filteredRows = [...rows];

      // Apply filtering based on query `q`
      if (q) {
        filteredRows = filteredRows.filter(
          (row) => row.email.toLowerCase().includes(q.toLowerCase()) || row.name?.toLowerCase().includes(q.toLowerCase()),
        );
      }

      // Apply filtering based on `role`
      if (role) filteredRows = filteredRows.filter(({ role: rowRole }) => rowRole === role);

      // Apply sorting based on `sort` and `order`
      if (sort) {
        filteredRows.sort((a, b) => {
          const aValue = a[sort];
          const bValue = b[sort];

          if (aValue == null || bValue == null) return 0;
          const compare = String(aValue).localeCompare(String(bValue), undefined, { numeric: true });
          return order === 'asc' ? compare : -compare;
        });
      }

      return filteredRows;
    }, [rows, q, sort, order, role]);

    useEffect(() => {
      setRows(info);
      updateCounts([], filteredAndSortedRows.length);
    }, [filteredAndSortedRows.length]);

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => {},
    }));

    return (
      <DataTable<OrganizationInvites>
        {...{
          columns: columns.filter((column) => column.visible),
          rows: filteredAndSortedRows,
          totalCount: info.length,
          rowHeight: 50,
          rowKeyGetter: (row) => row.id,
          // error,
          // isLoading,
          // isFetching,
          enableVirtualization: false,
          isFiltered: !!q || !!role,
          limit,
          // selectedRows,
          // onRowsChange,
          // fetchMore: fetchNextPage,
          // onSelectedRowsChange: setSelectedRows,
          sortColumns,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:invites').toLowerCase() })} />,
        }}
      />
    );
  }),
);
export default BaseDataTable;
