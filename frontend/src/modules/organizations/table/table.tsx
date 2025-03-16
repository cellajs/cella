import { onlineManager } from '@tanstack/react-query';
import { Bird } from 'lucide-react';
import { forwardRef, memo, useEffect, useImperativeHandle } from 'react';
import type { RowsChangeData } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { tablePropsAreEqual } from '~/modules/common/data-table/table-props-are-equal';
import type { BaseTableMethods, BaseTableProps } from '~/modules/common/data-table/types';
import { toaster } from '~/modules/common/toaster';
import { getAndSetMenu } from '~/modules/me/helpers';
import { inviteMembers as changeRole } from '~/modules/memberships/api';
import { organizationsQueryOptions } from '~/modules/organizations/query';
import type { OrganizationsSearch } from '~/modules/organizations/table/table-wrapper';
import type { Organization } from '~/modules/organizations/types';
import { useDataFromInfiniteQuery } from '~/query/hooks/use-data-from-query';
import { useUserStore } from '~/store/user';

type BaseDataTableProps = BaseTableProps<Organization, OrganizationsSearch>;

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

    const onRowsChange = async (changedRows: Organization[], { column, indexes }: RowsChangeData<Organization>) => {
      if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

      if (column.key !== 'role') return setRows(changedRows);

      // If user role is changed, invite user to organization
      for (const index of indexes) {
        const organization = changedRows[index];
        if (!organization.membership?.role) continue;

        changeRole({
          idOrSlug: organization.id,
          emails: [user.email],
          role: organization.membership?.role,
          entityType: 'organization',
          orgIdOrSlug: organization.id,
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

    useEffect(() => setTotal(totalCount), [totalCount]);

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => onSelectedRowsChange(new Set<string>()),
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
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: (
            <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:organizations').toLowerCase() })} />
          ),
        }}
      />
    );
  }),
  tablePropsAreEqual,
);

export default BaseDataTable;
