import { Bird } from 'lucide-react';
import { forwardRef, memo, useEffect, useImperativeHandle, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import type { InvitesInfoProps, InvitesInfoSearch } from '~/modules/organizations/invites/table';
import type { BaseTableMethods, BaseTableProps, OrganizationInvitesInfo } from '~/types/common';

type BaseDataTableProps = InvitesInfoProps & BaseTableProps<OrganizationInvitesInfo, InvitesInfoSearch>;

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(({ info, columns, queryVars, updateCounts, sortColumns, setSortColumns }, ref) => {
    const { t } = useTranslation();

    // Extract query variables and set defaults
    const { q, limit } = queryVars;

    const [rows, setRows] = useState<OrganizationInvitesInfo[]>(info);

    useEffect(() => {
      setRows(info);
      updateCounts([], info.length);
    }, [info]);

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => {},
    }));

    return (
      <DataTable<OrganizationInvitesInfo>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          totalCount: rows.length,
          rowHeight: 50,
          rowKeyGetter: (row) => row.id,
          // error,
          // isLoading,
          // isFetching,
          enableVirtualization: false,
          isFiltered: !!q,
          limit,
          // selectedRows,
          // onRowsChange,
          // fetchMore: fetchNextPage,
          // onSelectedRowsChange: setSelectedRows,
          sortColumns,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: (
            <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:organizations').toLowerCase() })} />
          ),
        }}
      />
    );
  }),
);
export default BaseDataTable;
