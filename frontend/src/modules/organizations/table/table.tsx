import { onlineManager } from '@tanstack/react-query';
import { Bird } from 'lucide-react';
import { forwardRef, memo, useEffect, useImperativeHandle } from 'react';
import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { membershipInvite as changeRole } from '~/api.gen';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { tablePropsAreEqual } from '~/modules/common/data-table/table-props-are-equal';
import type { BaseTableMethods, BaseTableProps } from '~/modules/common/data-table/types';
import { toaster } from '~/modules/common/toaster';
import { getAndSetMenu } from '~/modules/me/helpers';
import { organizationsQueryOptions } from '~/modules/organizations/query';
import type { OrganizationsSearch, OrganizationTable } from '~/modules/organizations/table/table-wrapper';
import { useDataFromInfiniteQuery } from '~/query/hooks/use-data-from-query';
import { useUserStore } from '~/store/user';

type BaseDataTableProps = BaseTableProps<OrganizationTable, OrganizationsSearch>;

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(({ columns, searchVars, sortColumns, setSortColumns, setTotal, setSelected }, ref) => {
    const { t } = useTranslation();
    const { user } = useUserStore();

    // Extract query variables and set defaults
    const { q, sort, order, limit } = searchVars;

    // Query organizations
    const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } = useDataFromInfiniteQuery(
      organizationsQueryOptions({ q, sort, order, limit }),
    );

    const onRowsChange = async (changedRows: OrganizationTable[], { column, indexes }: RowsChangeData<OrganizationTable>) => {
      if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

      if (column.key !== 'role') return setRows(changedRows);

      // If user role is changed, invite user to organization
      for (const index of indexes) {
        const organization = changedRows[index];
        if (!organization.membership?.role) continue;

        changeRole({
          query: {
            idOrSlug: organization.id,
            entityType: 'organization',
          },
          path: { orgIdOrSlug: organization.id },
          body: {
            emails: [user.email],
            role: organization.membership?.role,
          },
        })
          .then(() => {
            getAndSetMenu();
            toaster(t('common:success.role_updated'), 'success');
          })
          .catch(() => toaster(t('error:error'), 'error'));
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

    useEffect(() => setTotal(totalCount), [totalCount]);

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => onSelectedRowsChange(new Set<string>()),
    }));

    return (
      <DataTable<OrganizationTable>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          totalCount,
          rowHeight: 52,
          rowKeyGetter: (row) => row.id,
          error,
          isLoading,
          isFetching,
          enableVirtualization: false,
          isFiltered: !!q,
          limit,
          selectedRows,
          onRowsChange,
          fetchMore: fetchNextPage,
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: (
            <ContentPlaceholder icon={Bird} title={t('common:no_resource_yet', { resource: t('common:organizations').toLowerCase() })} />
          ),
        }}
      />
    );
  }),
  tablePropsAreEqual,
);

export default BaseDataTable;
