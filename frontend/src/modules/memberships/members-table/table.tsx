import { Users } from 'lucide-react';
import { forwardRef, memo, useCallback, useImperativeHandle } from 'react';
import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import { tablePropsAreEqual } from '~/modules/common/data-table/table-props-are-equal';
import type { BaseTableMethods, BaseTableProps } from '~/modules/common/data-table/types';
import type { MemberSearch, MembersTableWrapperProps } from '~/modules/memberships/members-table/table-wrapper';
import type { membersQueryOptions } from '~/modules/memberships/query';
import { useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import type { Member } from '~/modules/memberships/types';
import { useDataFromInfiniteQuery } from '~/query/hooks/use-data-from-query';

type MembersTableProps = MembersTableWrapperProps & BaseTableProps<Member, MemberSearch, ReturnType<typeof membersQueryOptions>>;

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, MembersTableProps>(({ queryOptions, entity, columns, searchVars, sortColumns, setSortColumns, setSelected }, ref) => {
    const { t } = useTranslation();

    // Extract query variables
    const { q, role, limit } = searchVars;

    // Query members
    const { rows, selectedRows, setRows, setSelectedRows, isLoading, isFetching, error, isFetchingNextPage, fetchNextPage, hasNextPage } =
      useDataFromInfiniteQuery(queryOptions);

    const updateMemberMembership = useMemberUpdateMutation();

    // Update rows
    const onRowsChange = (changedRows: Member[], { indexes, column }: RowsChangeData<Member>) => {
      if (column.key !== 'role') return setRows(changedRows);

      const idOrSlug = entity.slug;
      const entityType = entity.entityType;
      const organizationId = entity.organizationId || entity.id;

      // If role is changed, update membership
      for (const index of indexes) {
        const updatedMembership = {
          id: changedRows[index].membership.id,
          role: changedRows[index].membership.role,
          orgIdOrSlug: organizationId,
          // Mutation variables
          idOrSlug,
          entityType,
        };

        updateMemberMembership.mutateAsync(updatedMembership);
      }
      setRows(changedRows);
    };

    const fetchMore = useCallback(async () => {
      if (!hasNextPage || isLoading || isFetching || isFetchingNextPage) return;
      await fetchNextPage();
    }, [hasNextPage, isLoading, isFetching, isFetchingNextPage]);

    const onSelectedRowsChange = (value: Set<string>) => {
      setSelectedRows(value);
      setSelected(rows.filter((row) => value.has(row.id)));
    };

    const onSortColumnsChange = (sortColumns: SortColumn[]) => {
      setSortColumns(sortColumns);
      onSelectedRowsChange(new Set<string>());
    };

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => onSelectedRowsChange(new Set<string>()),
    }));

    return (
      <DataTable<Member>
        {...{
          columns: columns.filter((column) => column.visible),
          rowHeight: 52,
          enableVirtualization: false,
          onRowsChange,
          rows,
          limit,
          rowKeyGetter: (row) => row.id,
          error,
          isLoading,
          isFetching,
          hasNextPage,
          fetchMore,
          isFiltered: role !== undefined || !!q,
          selectedRows,
          onSelectedRowsChange,
          sortColumns,
          onSortColumnsChange,
          NoRowsComponent: <ContentPlaceholder icon={Users} title={t('common:no_resource_yet', { resource: t('common:members').toLowerCase() })} />,
        }}
      />
    );
  }),
  tablePropsAreEqual,
);

export default BaseDataTable;
