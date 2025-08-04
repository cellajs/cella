import { onlineManager } from '@tanstack/react-query';
import { Bird } from 'lucide-react';
import { forwardRef, memo, useEffect, useImperativeHandle } from 'react';
import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { membershipInvite } from '~/api.gen';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { tablePropsAreEqual } from '~/modules/common/data-table/table-props-are-equal';
import type { BaseTableMethods, BaseTableProps } from '~/modules/common/data-table/types';
import { toaster } from '~/modules/common/toaster';
import { getAndSetMenu } from '~/modules/me/helpers';
import { useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import { organizationsQueryOptions } from '~/modules/organizations/query';
import type { OrganizationsSearch, OrganizationTable } from '~/modules/organizations/table/table-wrapper';
import { useDataFromInfiniteQuery } from '~/query/hooks/use-data-from-query';
import { useUserStore } from '~/store/user';

type BaseDataTableProps = BaseTableProps<OrganizationTable, OrganizationsSearch>;

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(({ columns, searchVars, sortColumns, setSortColumns, setTotal, setSelected }, ref) => {
    const { t } = useTranslation();
    const { user } = useUserStore();
    const updateMemberMembership = useMemberUpdateMutation();

    // Extract query variables and set defaults
    const { q, sort, order, limit } = searchVars;

    // Query organizations
    const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } = useDataFromInfiniteQuery(
      organizationsQueryOptions({ q, sort, order, limit }),
    );

    const onRowsChange = async (changedRows: OrganizationTable[], { column, indexes }: RowsChangeData<OrganizationTable>) => {
      if (!onlineManager.isOnline()) {
        toaster(t('common:action.offline.text'), 'warning');
        return;
      }

      if (column.key !== 'role') {
        setRows(changedRows);
        return;
      }

      for (const index of indexes) {
        const organization = changedRows[index];
        const membership = organization.membership;

        if (!membership?.role) continue;

        const newRole = membership.role;
        const partOfOrganization = !!membership.id;
        const mutationVariables = {
          idOrSlug: organization.slug,
          entityType: organization.entityType,
        };
        const orgIdOrSlug = organization.id;

        try {
          if (partOfOrganization) {
            await updateMemberMembership.mutateAsync({ id: membership.id, role: newRole, orgIdOrSlug, ...mutationVariables });
          } else {
            await membershipInvite({ query: mutationVariables, path: { orgIdOrSlug }, body: { emails: [user.email], role: newRole } });
            await getAndSetMenu();
            toaster(t('common:success.role_updated'), 'success');
          }
        } catch (err) {
          toaster(t('error:error'), 'error');
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
