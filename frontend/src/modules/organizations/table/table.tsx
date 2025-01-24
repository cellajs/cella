import { onlineManager } from '@tanstack/react-query';
import { Bird } from 'lucide-react';
import { forwardRef, memo, useEffect, useImperativeHandle } from 'react';
import type { RowsChangeData } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { createToast } from '~/modules/common/toaster';
import { inviteMembers } from '~/modules/memberships/api';
import { organizationsQueryOptions } from '~/modules/organizations/query';
import type { OrganizationsSearch } from '~/modules/organizations/table';
import { useDataFromSuspenseInfiniteQuery } from '~/query/hooks/use-data-from-query';
import { useUserStore } from '~/store/user';
import type { BaseTableMethods, BaseTableProps, Organization } from '~/types/common';

type BaseDataTableProps = BaseTableProps<Organization, OrganizationsSearch>;

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(({ columns, queryVars, updateCounts, sortColumns, setSortColumns }, ref) => {
    const { t } = useTranslation();
    const { user } = useUserStore();

    // Extract query variables and set defaults
    const { q, sort, order, limit } = queryVars;

    // Query organizations
    const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } =
      useDataFromSuspenseInfiniteQuery(organizationsQueryOptions({ q, sort, order, limit }));

    const onRowsChange = async (changedRows: Organization[], { column, indexes }: RowsChangeData<Organization>) => {
      if (!onlineManager.isOnline()) return createToast(t('common:action.offline.text'), 'warning');

      if (column.key !== 'role') return setRows(changedRows);

      // If user role is changed, invite user to organization
      for (const index of indexes) {
        const organization = changedRows[index];
        if (!organization.membership?.role) continue;

        inviteMembers({
          idOrSlug: organization.id,
          emails: [user.email],
          role: organization.membership?.role,
          entityType: 'organization',
          orgIdOrSlug: organization.id,
        })
          .then(() => toast.success(t('common:success.role_updated')))
          .catch(() => toast.error(t('error:error')));
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
          rowHeight: 50,
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
