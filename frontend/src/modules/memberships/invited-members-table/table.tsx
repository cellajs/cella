import { Bird } from 'lucide-react';
import { forwardRef, memo, useEffect, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import type { BaseTableMethods, BaseTableProps } from '~/modules/common/data-table/types';
import type { InvitedMembersSearch, InvitedMembersTableProps } from '~/modules/memberships/invited-members-table';
import { invitedMembersQueryOptions } from '~/modules/memberships/query';
import type { InvitedMember } from '~/modules/memberships/types';
import { useDataFromSuspenseInfiniteQuery } from '~/query/hooks/use-data-from-query';

type BaseDataTableProps = InvitedMembersTableProps & BaseTableProps<InvitedMember, InvitedMembersSearch>;

const BaseDataTable = memo(
  forwardRef<BaseTableMethods, BaseDataTableProps>(({ entity, columns, queryVars, updateCounts, sortColumns, setSortColumns }, ref) => {
    const { t } = useTranslation();

    const entityType = entity.entity;
    const organizationId = entity.organizationId || entity.id;

    // Extract query variables and set defaults
    const { sort, order, limit } = queryVars;

    // Query invited members
    const { rows, totalCount, isLoading, isFetching, error, fetchNextPage } = useDataFromSuspenseInfiniteQuery(
      invitedMembersQueryOptions({
        idOrSlug: entity.slug,
        entityType,
        orgIdOrSlug: organizationId,
        sort,
        order,
        limit,
      }),
    );

    useEffect(() => updateCounts([], totalCount), [totalCount]);

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => {},
    }));

    return (
      <DataTable<InvitedMember>
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
          limit,
          fetchMore: fetchNextPage,
          sortColumns,
          onSortColumnsChange: setSortColumns,
          NoRowsComponent: <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:invites').toLowerCase() })} />,
        }}
      />
    );
  }),
);
export default BaseDataTable;
