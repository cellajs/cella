import { onlineManager } from '@tanstack/react-query';
import { forwardRef, memo, useEffect, useImperativeHandle, useState } from 'react';

import { Bird } from 'lucide-react';
import type { RowsChangeData } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { inviteMembers } from '~/api/memberships';
import { useDataFromSuspenseInfiniteQuery } from '~/hooks/use-data-from-query';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';

import type { SortColumn } from 'react-data-grid';
import type { SearchKeys, SearchParams } from '~/hooks/use-search-params';
import { showToast } from '~/lib/toasts';
import { getSortColumns } from '~/modules/common/data-table/sort-columns';
import type { OrganizationsSearch } from '~/modules/organizations/organizations-table';
import { organizationsQueryOptions } from '~/modules/organizations/organizations-table/helpers/query-options';
import { useUserStore } from '~/store/user';
import type { BaseTableMethods, BaseTableProps, BaseTableQueryVariables, Organization } from '~/types/common';

type BaseDataTableProps = BaseTableProps<Organization> & {
  queryVars: BaseTableQueryVariables<OrganizationsSearch>;
  setSearch: (newValues: SearchParams<SearchKeys>, saveSearch?: boolean) => void;
};

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(({ columns, queryVars, updateCounts, setSearch }, ref) => {
    const { t } = useTranslation();
    const { user } = useUserStore();

    // Extract query variables and set defaults
    const { q, sort = 'createdAt', order = 'desc', limit } = queryVars;

    const [sortColumns, setSortColumns] = useState<SortColumn[]>(getSortColumns(order, sort));

    // Update sort
    const updateSort = (newColumnsSort: SortColumn[]) => {
      setSortColumns(newColumnsSort);

      const [sortColumn] = newColumnsSort;
      const { columnKey, direction } = sortColumn;
      setSearch({ sort: columnKey as OrganizationsSearch['sort'], order: direction.toLowerCase() as OrganizationsSearch['order'] });
    };
    // Query organizations
    const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } =
      useDataFromSuspenseInfiniteQuery(organizationsQueryOptions({ q, sort, order, limit }));

    const onRowsChange = async (changedRows: Organization[], { column, indexes }: RowsChangeData<Organization>) => {
      if (!onlineManager.isOnline()) return showToast(t('common:action.offline.text'), 'warning');

      if (column.key !== 'userRole') return setRows(changedRows);

      // If user role is changed, invite user to organization
      for (const index of indexes) {
        const organization = changedRows[index];
        if (!organization.membership?.role) continue;

        inviteMembers({
          idOrSlug: organization.id,
          emails: [user.email],
          role: organization.membership?.role,
          entityType: 'organization',
          organizationId: organization.id,
        })
          .then(() => toast.success(t('common:success.role_updated')))
          .catch(() => toast.error(t('common:error.error')));
      }

      setRows(changedRows);
    };

    useEffect(() => {
      updateCounts(
        rows.filter((row) => selectedRows.has(row.id)),
        totalCount,
      );
    }, [selectedRows, rows, totalCount]);

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => setSelectedRows(new Set<string>()),
    }));

    return (
      <DataTable<Organization>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          totalCount,
          rowHeight: 42,
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
          onSelectedRowsChange: setSelectedRows,
          sortColumns,
          onSortColumnsChange: updateSort,
          NoRowsComponent: (
            <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:organizations').toLowerCase() })} />
          ),
        }}
      />
    );
  }),
);
export default BaseDataTable;
